import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AlertsQuery, LoginAttemptsQuery, PaginationQuery } from './dto/security.dto';

const USER_SELECT = { id: true, name: true, phone: true, email: true } as const;

/** Read-only security feeds for the admin panel. No writes except mark-seen. */
@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async alerts(query: AlertsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.unseenOnly ? { seen: false } : {};
    const [total, data] = await this.prisma.$transaction([
      this.prisma.securityAlert.count({ where }),
      this.prisma.securityAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: USER_SELECT } },
      }),
    ]);
    return { data, total, page, limit };
  }

  async markSeen(id: string) {
    const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!alert) throw new BadRequestException('Alert not found');
    return this.prisma.securityAlert.update({ where: { id }, data: { seen: true } });
  }

  async loginAttempts(query: LoginAttemptsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.success === undefined ? {} : { success: query.success };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.loginAttempt.count({ where }),
      this.prisma.loginAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: USER_SELECT } },
      }),
    ]);
    return { data, total, page, limit };
  }

  /**
   * Unauthorized download/access attempts. The app has no download feature,
   * so "who downloaded what" doesn't exist — THIS is the real metric: every
   * denied /access request (no permission, revoked device, expired URL
   * sharing, ...) is logged here with the server-side reason.
   */
  async deniedAttempts(query: PaginationQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { event: 'access_denied' };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.contentEvent.count({ where }),
      this.prisma.contentEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          contentType: true,
          contentId: true,
          meta: true,
          createdAt: true,
          user: { select: USER_SELECT },
        },
      }),
    ]);
    return { data, total, page, limit };
  }
}
