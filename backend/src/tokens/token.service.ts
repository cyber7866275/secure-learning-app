import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type VerifiedRefresh = RefreshToken & {
  user: { id: string; status: string; accessExpiresAt: Date | null };
  device: { id: string; revoked: boolean } | null;
};

/**
 * Owns everything about refresh tokens:
 *  - opaque random tokens, only SHA-256 hashes stored (a DB leak reveals nothing usable)
 *  - ROTATION: every /auth/refresh consumes the old token and issues a new pair
 *  - REUSE DETECTION: presenting an already-rotated token means the token was
 *    likely stolen -> ALL of the user's sessions are revoked and a security
 *    alert is raised (this is the theft-detection behavior from the spec)
 *  - Redis blacklist (`rt:bl:<hash>`) makes remote logout / device revoke
 *    effective immediately for the refresh flow
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async createPair(opts: {
    userId: string;
    type: 'user' | 'admin';
    deviceId?: string;
  }): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { type: opts.type, deviceId: opts.deviceId },
      {
        subject: opts.userId,
        expiresIn: this.config.getOrThrow<number>('accessTokenTtlSec'),
      },
    );

    const raw = randomBytes(48).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('refreshTokenTtlDays') * 86_400_000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: opts.userId,
        deviceId: opts.deviceId ?? null,
        tokenHash: this.hashToken(raw),
        expiresAt,
      },
    });

    return { accessToken, refreshToken: raw, refreshExpiresAt: expiresAt };
  }

  /**
   * Validates a presented refresh token. Throws 401/403 with no further
   * processing on any problem. NEVER returns the raw token (we only have hashes).
   */
  async verifyRefresh(raw: string): Promise<VerifiedRefresh> {
    const hash = this.hashToken(raw);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true, device: true },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revoked) {
      // Someone presented a token that was already rotated or revoked.
      // Assume theft: nuke every session and raise an alert.
      await this.revokeAllUserTokens(record.userId);
      await this.prisma.securityAlert.create({
        data: {
          type: 'REFRESH_REUSE',
          userId: record.userId,
          detail: { deviceId: record.deviceId, at: new Date().toISOString() },
        },
      });
      throw new UnauthorizedException(
        'Session compromised: this token was already used. All sessions have been revoked.',
      );
    }

    // Defense in depth: Redis blacklist mirrors DB revocation (remote logout /
    // device revoke write to both). If they ever disagree, deny.
    const blacklisted = await this.redis.client.get(`rt:bl:${hash}`);
    if (blacklisted) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.expiresAt < new Date()) {
      await this.revokeTokenRecord(record.id, hash, record.expiresAt);
      throw new UnauthorizedException('Refresh token expired');
    }

    if (record.user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is blocked');
    }
    if (record.user.accessExpiresAt && record.user.accessExpiresAt < new Date()) {
      throw new ForbiddenException('Account access has expired');
    }
    if (record.device && record.device.revoked) {
      throw new ForbiddenException('Device has been revoked');
    }

    return record as VerifiedRefresh;
  }

  /**
   * Consumes one refresh token and returns a fresh pair (rotation).
   *
   * NOTE (race): two concurrent refreshes with the same token can both pass
   * verification before either revokes. Mobile clients serialize refresh, so
   * this is accepted for Stage 1; a strict fix would SELECT .. FOR UPDATE the
   * token row inside a transaction (Stage 7 hardening).
   */
  async rotate(raw: string): Promise<TokenPair> {
    const record = await this.verifyRefresh(raw);
    await this.revokeTokenRecord(record.id, this.hashToken(raw), record.expiresAt);
    return this.createPair({
      userId: record.userId,
      type: 'user',
      deviceId: record.deviceId ?? undefined,
    });
  }

  /** Idempotent logout for a single refresh token. */
  async revokeRawToken(raw: string): Promise<void> {
    const hash = this.hashToken(raw);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (record && !record.revoked) {
      await this.revokeTokenRecord(record.id, hash, record.expiresAt);
    }
  }

  async revokeTokenRecord(id: string, hash: string, expiresAt: Date): Promise<void> {
    const ttlSec = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await this.prisma.refreshToken
      .update({ where: { id }, data: { revoked: true } })
      .catch(() => null);
    await this.redis.client.set(`rt:bl:${hash}`, '1', 'EX', ttlSec);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false },
      select: { tokenHash: true, expiresAt: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    if (tokens.length > 0) {
      const pipe = this.redis.client.pipeline();
      for (const t of tokens) {
        const ttlSec = Math.max(60, Math.floor((t.expiresAt.getTime() - Date.now()) / 1000));
        pipe.set(`rt:bl:${t.tokenHash}`, '1', 'EX', ttlSec);
      }
      await pipe.exec();
    }
  }

  async revokeDeviceTokens(deviceId: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { deviceId, revoked: false },
      select: { tokenHash: true, expiresAt: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { deviceId, revoked: false },
      data: { revoked: true },
    });
    if (tokens.length > 0) {
      const pipe = this.redis.client.pipeline();
      for (const t of tokens) {
        const ttlSec = Math.max(60, Math.floor((t.expiresAt.getTime() - Date.now()) / 1000));
        pipe.set(`rt:bl:${t.tokenHash}`, '1', 'EX', ttlSec);
      }
      await pipe.exec();
    }
  }
}
