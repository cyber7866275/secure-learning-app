import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertType, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, timingSafeEqual } from 'crypto';
import { DevicesService } from '../devices/devices.service';
import { IntegrityService } from '../integrity/integrity.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { TokenService, TokenPair } from '../tokens/token.service';
import {
  AdminLoginDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import type { OtpProvider } from './otp/otp-provider.interface';

interface OtpRecord {
  hash: string; // sha256 hex of the 6-digit code
  attempts: number;
}

/** Fields every login-ish DTO carries for Stage 7 device posture checks. */
interface DevicePosture {
  integrityToken?: string;
  rooted?: boolean;
  deviceFingerprint: string;
}

export interface AuthResult extends TokenPair {
  user: SafeUser;
}

type SafeUser = Omit<User, 'passwordHash'>;

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

/**
 * Authentication: OTP (phone) + email/password for users, email/password for
 * admins. Every login binds a device (see DevicesService) and every attempt —
 * success or failure — is logged to login_attempts for the Stage 6 analytics
 * and security-alert work.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly devices: DevicesService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly integrity: IntegrityService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  // ------------------------------------------------------------- OTP ----

  async requestOtp(dto: RequestOtpDto): Promise<{ message: string; expiresInSec: number }> {
    const cooldownKey = `otp:cd:${dto.phone}`;
    if (await this.redis.client.get(cooldownKey)) {
      throw new HttpException(
        'Please wait before requesting another OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const record: OtpRecord = {
      hash: createHash('sha256').update(otp).digest('hex'),
      attempts: 0,
    };
    const ttl = this.config.getOrThrow<number>('otpTtlSec');
    await this.redis.client.set(`otp:${dto.phone}`, JSON.stringify(record), 'EX', ttl);
    await this.redis.client.set(
      cooldownKey,
      '1',
      'EX',
      this.config.getOrThrow<number>('otpCooldownSec'),
    );

    await this.otpProvider.sendOtp(dto.phone, otp);
    return { message: 'OTP sent', expiresInSec: ttl };
  }

  async verifyOtp(dto: VerifyOtpDto, ip?: string): Promise<AuthResult> {
    const key = `otp:${dto.phone}`;
    const raw = await this.redis.client.get(key);
    const maxAttempts = this.config.getOrThrow<number>('otpMaxAttempts');

    if (!raw) {
      await this.logAttempt(dto.phone, false, ip, dto.deviceFingerprint);
      throw new UnauthorizedException('OTP expired or not requested. Please request a new one.');
    }

    const record = JSON.parse(raw) as OtpRecord;
    if (record.attempts >= maxAttempts) {
      await this.redis.client.del(key);
      await this.logAttempt(dto.phone, false, ip, dto.deviceFingerprint);
      throw new UnauthorizedException('Too many wrong attempts. Please request a new OTP.');
    }

    // Constant-time compare of the hashes (both are 32-byte sha256 digests).
    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from(createHash('sha256').update(dto.otp).digest('hex'), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      record.attempts += 1;
      const ttl = Math.max(await this.redis.client.ttl(key), 1);
      await this.redis.client.set(key, JSON.stringify(record), 'EX', ttl);
      await this.logAttempt(dto.phone, false, ip, dto.deviceFingerprint);
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.client.del(key);

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          name: dto.name?.trim() || 'User',
          maxDevices: this.config.getOrThrow<number>('defaultMaxDevices'),
        },
      });
    }
    this.assertUserCanLogin(user);

    // Stage 7: root self-report + Play Integrity verdict, per admin settings.
    await this.checkDevicePosture(dto, user, ip);

    const device = await this.devices.bindDevice(
      user,
      dto.deviceFingerprint,
      dto.deviceName,
      ip,
    );
    await this.logAttempt(dto.phone, true, ip, dto.deviceFingerprint, user.id);
    await this.checkMultiIp(user.id, ip);
    const pair = await this.tokens.createPair({
      userId: user.id,
      type: 'user',
      deviceId: device.id,
    });
    return { ...pair, user: toSafeUser(user) };
  }

  // --------------------------------------------------- email/password ----

  async register(dto: RegisterDto, ip?: string): Promise<AuthResult> {
    const phoneTaken = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (phoneTaken) throw new ConflictException('Phone number is already registered');
    if (dto.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailTaken) throw new ConflictException('Email is already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email ?? null,
        phone: dto.phone,
        passwordHash: dto.password
          ? await argon2.hash(dto.password, { type: argon2.argon2id })
          : null,
        maxDevices: dto.maxDevices ?? this.config.getOrThrow<number>('defaultMaxDevices'),
      },
    });

    // Stage 7: root self-report + Play Integrity verdict, per admin settings.
    await this.checkDevicePosture(dto, user, ip);

    const device = await this.devices.bindDevice(
      user,
      dto.deviceFingerprint,
      dto.deviceName,
      ip,
    );
    await this.logAttempt(dto.email ?? dto.phone, true, ip, dto.deviceFingerprint, user.id);
    await this.checkMultiIp(user.id, ip);
    const pair = await this.tokens.createPair({
      userId: user.id,
      type: 'user',
      deviceId: device.id,
    });
    return { ...pair, user: toSafeUser(user) };
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResult> {
    // Same message for "no such user" and "wrong password" so attackers
    // can't enumerate accounts.
    const invalid = async (): Promise<void> => {
      await this.logAttempt(dto.email, false, ip, dto.deviceFingerprint);
    };

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      await invalid();
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      await invalid();
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertUserCanLogin(user);

    // Stage 7: root self-report + Play Integrity verdict, per admin settings.
    await this.checkDevicePosture(dto, user, ip);

    const device = await this.devices.bindDevice(
      user,
      dto.deviceFingerprint,
      dto.deviceName,
      ip,
    );
    await this.logAttempt(dto.email, true, ip, dto.deviceFingerprint, user.id);
    await this.checkMultiIp(user.id, ip);
    const pair = await this.tokens.createPair({
      userId: user.id,
      type: 'user',
      deviceId: device.id,
    });
    return { ...pair, user: toSafeUser(user) };
  }

  async adminLogin(dto: AdminLoginDto, ip?: string): Promise<TokenPair> {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (!admin || !(await argon2.verify(admin.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    // Stage 1: admins get tokens without device binding (admin panel runs in a
    // browser). Stage 7 decision: admin API routes are protected by IP
    // allow-listing at the reverse proxy / Cloudflare WAF instead — see
    // DEPLOYMENT.md. Do NOT expose /admin/* to the open internet.
    void ip;
    return this.tokens.createPair({ userId: admin.id, type: 'admin' });
  }

  // ------------------------------------------------------------- tokens ----

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    return this.tokens.rotate(dto.refreshToken);
  }

  async logout(dto: RefreshDto): Promise<{ message: string }> {
    await this.tokens.revokeRawToken(dto.refreshToken);
    return { message: 'Logged out' };
  }

  // ------------------------------------------------------------ helpers ----

  private assertUserCanLogin(user: User): void {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is blocked. Contact support.');
    }
    if (user.accessExpiresAt && user.accessExpiresAt < new Date()) {
      throw new ForbiddenException('Account access has expired. Contact support.');
    }
  }

  /**
   * Stage 7 device posture enforcement. Two independent layers:
   *
   * 1. Root self-report — the app's RootBeer check sends `rooted: true`
   *    honestly. The server writes a ROOT_DETECTED alert and blocks the login
   *    when `root_block_enabled` is on (default). A tampered app can lie
   *    about this flag, which is exactly why layer 2 exists.
   * 2. Play Integrity verdict — hardware-backed. `integrity_enforcement`:
   *    off = skip; log = verify and alert on failure, login proceeds;
   *    block = 403 on failure (or on a missing token, since a "block"
   *    deployment must not be bypassable by simply omitting the token).
   *
   * Called only after credentials are valid, so failures here don't leak
   * whether the account exists. Best-effort alert writes never break login.
   */
  private async checkDevicePosture(
    dto: DevicePosture,
    user: User,
    ip?: string,
  ): Promise<void> {
    const settings = await this.settings.getAll().catch(() => null);

    if (dto.rooted === true) {
      await this.raiseRootAlert(user.id, dto.deviceFingerprint, ip).catch(() => null);
      if (settings?.['root_block_enabled'] !== 'false') {
        throw new ForbiddenException(
          'This device appears to be rooted. Please log in from a non-rooted device.',
        );
      }
    }

    const enforcement = settings?.['integrity_enforcement'] ?? 'log';
    if (enforcement === 'off' || !this.integrity.enabled) return;

    if (!dto.integrityToken) {
      if (enforcement === 'block') {
        throw new ForbiddenException(
          'App integrity check required. Please update to the latest version of the app.',
        );
      }
      return; // 'log' mode without a token: nothing to verify.
    }

    const verdict = await this.integrity.verify(dto.integrityToken);
    if (!verdict.ok) {
      await this.prisma.securityAlert
        .create({
          data: {
            type: AlertType.INTEGRITY_FAILED,
            userId: user.id,
            detail: { reasons: verdict.reasons, ip: ip ?? null },
          },
        })
        .catch(() => null);
      if (enforcement === 'block') {
        throw new ForbiddenException(
          'This app did not pass the integrity check. Please reinstall it from Google Play.',
        );
      }
    }
  }

  /** ROOT_DETECTED alert from the login flow (pre-login; no JWT yet). Deduplicated per user per 24h. */
  private async raiseRootAlert(
    userId: string,
    deviceFingerprint?: string,
    ip?: string,
  ): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.securityAlert.findFirst({
      where: { userId, type: AlertType.ROOT_DETECTED, createdAt: { gte: since } },
    });
    if (recent) return;
    await this.prisma.securityAlert.create({
      data: {
        type: AlertType.ROOT_DETECTED,
        userId,
        detail: { deviceFingerprint: deviceFingerprint ?? null, ip: ip ?? null, source: 'login' },
      },
    });
  }

  private async logAttempt(
    identifier: string,
    success: boolean,
    ip?: string,
    deviceFingerprint?: string,
    userId?: string,
  ): Promise<void> {
    // Best-effort: analytics must never break the auth flow itself.
    await this.prisma.loginAttempt
      .create({ data: { identifier, success, ip, deviceFingerprint, userId } })
      .catch(() => null);
  }

  /**
   * Suspicious-activity rule (Stage 6): after a successful login, count the
   * distinct IPs with successful logins for this user in the last 24h. Three
   * or more distinct IPs suggests credential sharing or account takeover, so
   * a MULTI_IP security alert is raised.
   *
   * Best-effort and deduplicated (at most one alert per user per 24h) so a
   * failure here can never break login. Future rules — impossible travel,
   * device-fingerprint farming, login velocity — can hook in alongside this.
   */
  private async checkMultiIp(userId: string, ip?: string): Promise<void> {
    if (!ip) return;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const attempts = await this.prisma.loginAttempt.findMany({
        where: { userId, success: true, createdAt: { gte: since } },
        select: { ip: true },
      });
      const distinctIps = new Set(attempts.map((a) => a.ip).filter((x): x is string => !!x));
      if (distinctIps.size < 3) return;
      const recent = await this.prisma.securityAlert.findFirst({
        where: { userId, type: AlertType.MULTI_IP, createdAt: { gte: since } },
      });
      if (recent) return;
      await this.prisma.securityAlert.create({
        data: {
          type: AlertType.MULTI_IP,
          userId,
          detail: { distinctIpCount: distinctIps.size, ips: [...distinctIps].slice(0, 10) },
        },
      });
    } catch {
      // Never break login over analytics.
    }
  }
}
