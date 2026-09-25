import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionTarget, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GrantPermissionDto, ListPermissionsQuery } from './dto/permissions.dto';

const TARGET_MAP: Record<GrantPermissionDto['contentType'], PermissionTarget> = {
  pdf: PermissionTarget.PDF,
  video: PermissionTarget.VIDEO,
  category: PermissionTarget.CATEGORY,
};

/** Minimal content reference needed for a permission decision. */
export interface ContentRef {
  id: string;
  categoryId?: string | null;
}

const notExpired: Prisma.PermissionWhereInput = {
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
};

/**
 * Default-deny permission resolution. NO permission row = NO access.
 * Resolution order: explicit item grant/deny -> category grant/deny -> deny.
 * A `granted=false` row is an explicit deny and short-circuits.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccess(
    userId: string,
    target: PermissionTarget,
    content: ContentRef,
  ): Promise<boolean> {
    const rows = await this.prisma.permission.findMany({
      where: {
        userId,
        ...notExpired,
        OR: [
          { target, targetId: content.id },
          ...(content.categoryId
            ? [{ target: PermissionTarget.CATEGORY, targetId: content.categoryId }]
            : []),
        ],
      },
      select: { target: true, targetId: true, granted: true },
    });

    // Explicit item-level decision wins (allow or deny).
    const item = rows.find((r) => r.target === target && r.targetId === content.id);
    if (item) return item.granted;

    // Fall back to the item's category grant.
    if (content.categoryId) {
      const cat = rows.find(
        (r) => r.target === PermissionTarget.CATEGORY && r.targetId === content.categoryId,
      );
      if (cat) return cat.granted;
    }

    return false;
  }

  /** IDs of items the user may access, used to filter library queries. */
  async accessibleIds(
    userId: string,
    target: Extract<PermissionTarget, 'PDF' | 'VIDEO'>,
  ): Promise<{ itemIds: string[]; categoryIds: string[] }> {
    const rows = await this.prisma.permission.findMany({
      where: { userId, granted: true, ...notExpired, target: { in: [target, PermissionTarget.CATEGORY] } },
      select: { target: true, targetId: true },
    });
    return {
      itemIds: rows.filter((r) => r.target === target).map((r) => r.targetId),
      categoryIds: rows.filter((r) => r.target === PermissionTarget.CATEGORY).map((r) => r.targetId),
    };
  }

  async grant(dto: GrantPermissionDto) {
    const target = TARGET_MAP[dto.contentType];

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    // The grant must point at something real.
    const exists =
      target === PermissionTarget.PDF
        ? await this.prisma.pdf.findUnique({ where: { id: dto.contentId }, select: { id: true } })
        : target === PermissionTarget.VIDEO
          ? await this.prisma.video.findUnique({ where: { id: dto.contentId }, select: { id: true } })
          : await this.prisma.category.findUnique({ where: { id: dto.contentId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`${dto.contentType} not found`);

    return this.prisma.permission.upsert({
      where: {
        userId_target_targetId: { userId: dto.userId, target, targetId: dto.contentId },
      },
      update: {
        granted: true,
        expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      create: {
        userId: dto.userId,
        target,
        targetId: dto.contentId,
        granted: true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async revoke(id: string) {
    const row = await this.prisma.permission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Permission not found');
    await this.prisma.permission.delete({ where: { id } });
    return { message: 'Permission revoked' };
  }

  async list(query: ListPermissionsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PermissionWhereInput = {};
    if (query.userId) where.userId = query.userId;
    if (query.target) where.target = query.target as PermissionTarget;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.permission.count({ where }),
      this.prisma.permission.findMany({
        where,
        include: { user: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }
}
