import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../tokens/token.service';

interface BindableUser {
  id: string;
  maxDevices: number;
}

/**
 * Device binding: every login is tied to a device fingerprint.
 * max_devices is enforced here. When the limit is exceeded the behavior is
 * controlled by DEVICE_OVERFLOW_BEHAVIOR:
 *   - "revoke-oldest" (default): oldest device session is revoked, login proceeds
 *   - "deny": login is rejected with 403
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async bindDevice(
    user: BindableUser,
    fingerprint: string,
    name?: string,
    ip?: string,
  ): Promise<Device> {
    const existing = await this.prisma.device.findUnique({
      where: { userId_fingerprint: { userId: user.id, fingerprint } },
    });

    if (existing) {
      if (existing.revoked) {
        throw new ForbiddenException(
          'This device has been revoked by an administrator. Contact support.',
        );
      }
      return this.prisma.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), ip: ip ?? existing.ip, name: name ?? existing.name },
      });
    }

    const activeCount = await this.prisma.device.count({
      where: { userId: user.id, revoked: false },
    });

    if (activeCount >= user.maxDevices) {
      const behavior = this.config.getOrThrow<'revoke-oldest' | 'deny'>('deviceOverflow');
      if (behavior === 'deny') {
        throw new ForbiddenException(
          `Device limit reached (${user.maxDevices}). Log out from another device or contact support.`,
        );
      }
      // revoke-oldest: evict the least-recently-seen device (and its sessions).
      const oldest = await this.prisma.device.findFirst({
        where: { userId: user.id, revoked: false },
        orderBy: { lastSeenAt: 'asc' },
      });
      if (oldest) {
        await this.revokeDevice(oldest.id);
      }
    }

    return this.prisma.device.create({
      data: { userId: user.id, fingerprint, name, ip },
    });
  }

  listUserDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        fingerprint: true,
        name: true,
        ip: true,
        lastSeenAt: true,
        revoked: true,
        createdAt: true,
      },
    });
  }

  /**
   * Remote logout of a single device: marks it revoked and kills all of its
   * refresh tokens (DB + Redis blacklist). Access tokens remain valid until
   * their 15-min expiry — documented, acceptable window.
   */
  async revokeDevice(deviceId: string): Promise<Device> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');
    if (!device.revoked) {
      await this.prisma.device.update({ where: { id: deviceId }, data: { revoked: true } });
      await this.tokens.revokeDeviceTokens(deviceId);
    }
    return { ...device, revoked: true };
  }
}
