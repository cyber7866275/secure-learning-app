import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertType, ContentStatus, PermissionTarget, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { hlsPrefixForStorageKey } from '../video-processing/hls-ffmpeg';
import {
  CreatePdfDto,
  CreateVideoDto,
  ListContentQuery,
  TaxonomyRefDto,
  UpdatePdfDto,
  UpdateVideoDto,
} from './dto/content.dto';

type ContentKind = 'pdf' | 'video';

/** Denied-access bursts that trigger a security alert. */
const DENIED_BURST_THRESHOLD = 10;
const DENIED_WINDOW_SEC = 300;

const TAXONOMY_INCLUDE = {
  category: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  chapter: { select: { id: true, name: true } },
} as const;

/**
 * Content management (admin) + the secure access gate (users).
 *
 * Security model: the bucket is private. Clients never see storage keys.
 * Every read goes through requestAccess(), which enforces — in order —
 * published status, device validity, and the default-deny permission check,
 * then issues a short-lived presigned GET URL (5 min PDF / 10 min video).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // ================================================================ taxonomy
  /**
   * Validates the category -> subject -> chapter chain and normalizes it.
   * Missing links become null; mismatched links are rejected.
   */
  async resolveTaxonomy(ref: TaxonomyRefDto): Promise<{
    categoryId: string | null;
    subjectId: string | null;
    chapterId: string | null;
  }> {
    let categoryId: string | null = ref.categoryId ?? null;
    let subjectId: string | null = ref.subjectId ?? null;
    const chapterId: string | null = ref.chapterId ?? null;

    if (categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!cat) throw new BadRequestException('categoryId does not exist');
    }

    if (subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, categoryId: true },
      });
      if (!subject) throw new BadRequestException('subjectId does not exist');
      if (categoryId && subject.categoryId !== categoryId) {
        throw new BadRequestException('subject does not belong to the given category');
      }
      // Infer the category from the subject when not given explicitly.
      if (!categoryId) categoryId = subject.categoryId;
    }

    if (chapterId) {
      const chapter = await this.prisma.chapter.findUnique({
        where: { id: chapterId },
        include: { subject: { select: { id: true, categoryId: true } } },
      });
      if (!chapter) throw new BadRequestException('chapterId does not exist');
      if (subjectId && chapter.subjectId !== subjectId) {
        throw new BadRequestException('chapter does not belong to the given subject');
      }
      if (categoryId && chapter.subject.categoryId !== categoryId) {
        throw new BadRequestException('chapter does not belong to the given category');
      }
      if (!subjectId) subjectId = chapter.subjectId;
      if (!categoryId) categoryId = chapter.subject.categoryId;
    }

    return { categoryId, subjectId, chapterId };
  }

  // ==================================================================== pdfs

  async createPdf(dto: CreatePdfDto) {
    const taxonomy = await this.resolveTaxonomy(dto);
    const storageKey = `pdfs/${randomUUID()}.pdf`;
    const uploadTtl = this.config.getOrThrow<number>('uploadTtlSec');

    const pdf = await this.prisma.pdf.create({
      data: { title: dto.title.trim(), ...taxonomy, storageKey, status: ContentStatus.DRAFT },
      include: TAXONOMY_INCLUDE,
    });

    const uploadUrl = await this.storage.getPresignedPutUrl(
      storageKey,
      'application/pdf',
      uploadTtl,
    );
    return { pdf, uploadUrl, storageKey, expiresInSec: uploadTtl };
  }

  async listPdfs(query: ListContentQuery) {
    const { where, page, limit } = this.buildListWhere(query);
    const pdfWhere = where as Prisma.PdfWhereInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.pdf.count({ where: pdfWhere }),
      this.prisma.pdf.findMany({
        where: pdfWhere,
        include: TAXONOMY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async getPdf(id: string) {
    const pdf = await this.prisma.pdf.findUnique({
      where: { id },
      include: TAXONOMY_INCLUDE,
    });
    if (!pdf) throw new NotFoundException('PDF not found');
    return pdf;
  }

  async updatePdf(id: string, dto: UpdatePdfDto) {
    await this.getPdf(id);
    const taxonomy = await this.resolveTaxonomy(dto);
    const data: Prisma.PdfUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.pageCount !== undefined) data.pageCount = dto.pageCount;
    if (dto.fileSize !== undefined) data.fileSize = dto.fileSize;
    if (dto.categoryId !== undefined) data.categoryId = taxonomy.categoryId;
    if (dto.subjectId !== undefined) data.subjectId = taxonomy.subjectId;
    if (dto.chapterId !== undefined) data.chapterId = taxonomy.chapterId;
    return this.prisma.pdf.update({ where: { id }, data, include: TAXONOMY_INCLUDE });
  }

  async setPdfStatus(id: string, status: ContentStatus) {
    const pdf = await this.getPdf(id);
    if (status === ContentStatus.PUBLISHED) {
      // Never publish a PDF whose file was never uploaded.
      const exists = await this.storage.objectExists(pdf.storageKey);
      if (!exists) {
        throw new BadRequestException(
          'Cannot publish: the PDF file has not been uploaded yet (use the presigned upload URL first)',
        );
      }
    }
    return this.prisma.pdf.update({ where: { id }, data: { status }, include: TAXONOMY_INCLUDE });
  }

  async deletePdf(id: string) {
    const pdf = await this.getPdf(id);
    await this.prisma.pdf.delete({ where: { id } });
    // Best-effort cleanup; the DB row is gone so no URL will ever be issued.
    await this.storage.deleteObject(pdf.storageKey);
    if (pdf.pendingStorageKey) await this.storage.deleteObject(pdf.pendingStorageKey);
    return { message: 'PDF deleted' };
  }

  /** Stage a replacement file: returns a PUT URL for a NEW key, keeps the old one live. */
  async replacePdf(id: string) {
    const pdf = await this.getPdf(id);
    const newKey = `pdfs/${randomUUID()}.pdf`;
    const uploadTtl = this.config.getOrThrow<number>('uploadTtlSec');
    if (pdf.pendingStorageKey) await this.storage.deleteObject(pdf.pendingStorageKey);
    await this.prisma.pdf.update({ where: { id }, data: { pendingStorageKey: newKey } });
    const uploadUrl = await this.storage.getPresignedPutUrl(newKey, 'application/pdf', uploadTtl);
    return { uploadUrl, storageKey: newKey, expiresInSec: uploadTtl };
  }

  /** Swap in the staged replacement after the upload is confirmed present. */
  async confirmReplacePdf(id: string) {
    const pdf = await this.getPdf(id);
    if (!pdf.pendingStorageKey) {
      throw new BadRequestException('No staged replacement found — call /replace first');
    }
    const exists = await this.storage.objectExists(pdf.pendingStorageKey);
    if (!exists) {
      throw new BadRequestException('Replacement file not uploaded yet');
    }
    const oldKey = pdf.storageKey;
    const updated = await this.prisma.pdf.update({
      where: { id },
      data: { storageKey: pdf.pendingStorageKey, pendingStorageKey: null },
      include: TAXONOMY_INCLUDE,
    });
    await this.storage.deleteObject(oldKey);
    return updated;
  }

  // ================================================================== videos

  async createVideo(dto: CreateVideoDto) {
    const taxonomy = await this.resolveTaxonomy(dto);
    const storageKey = `videos/${randomUUID()}/source.mp4`;
    const uploadTtl = this.config.getOrThrow<number>('uploadTtlSec');

    const video = await this.prisma.video.create({
      data: {
        title: dto.title.trim(),
        ...taxonomy,
        storageKey,
        status: ContentStatus.DRAFT,
        // STAGE 5: the transcode worker flips this to READY after producing HLS.
        processingStatus: 'PENDING',
      },
      include: TAXONOMY_INCLUDE,
    });

    const uploadUrl = await this.storage.getPresignedPutUrl(
      storageKey,
      'video/mp4',
      uploadTtl,
    );
    return { video, uploadUrl, storageKey, expiresInSec: uploadTtl };
  }

  async listVideos(query: ListContentQuery) {
    const { where, page, limit } = this.buildListWhere(query);
    const videoWhere = where as Prisma.VideoWhereInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.video.count({ where: videoWhere }),
      this.prisma.video.findMany({
        where: videoWhere,
        include: TAXONOMY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async getVideo(id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: TAXONOMY_INCLUDE,
    });
    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  async updateVideo(id: string, dto: UpdateVideoDto) {
    await this.getVideo(id);
    const taxonomy = await this.resolveTaxonomy(dto);
    const data: Prisma.VideoUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.durationSec !== undefined) data.durationSec = dto.durationSec;
    if (dto.thumbnailKey !== undefined) data.thumbnailKey = dto.thumbnailKey;
    if (dto.categoryId !== undefined) data.categoryId = taxonomy.categoryId;
    if (dto.subjectId !== undefined) data.subjectId = taxonomy.subjectId;
    if (dto.chapterId !== undefined) data.chapterId = taxonomy.chapterId;
    return this.prisma.video.update({ where: { id }, data, include: TAXONOMY_INCLUDE });
  }

  async setVideoStatus(id: string, status: ContentStatus) {
    const video = await this.getVideo(id);
    if (status === ContentStatus.PUBLISHED) {
      const exists = await this.storage.objectExists(video.storageKey);
      if (!exists) {
        throw new BadRequestException(
          'Cannot publish: the video file has not been uploaded yet (use the presigned upload URL first)',
        );
      }
    }
    return this.prisma.video.update({ where: { id }, data: { status }, include: TAXONOMY_INCLUDE });
  }

  async deleteVideo(id: string) {
    const video = await this.getVideo(id);
    await this.prisma.video.delete({ where: { id } });
    await this.storage.deleteObject(video.storageKey);
    if (video.pendingStorageKey) await this.storage.deleteObject(video.pendingStorageKey);
    if (video.thumbnailKey) await this.storage.deleteObject(video.thumbnailKey);
    // Clean up packaged HLS artifacts (segments, playlists, key) if any.
    try {
      const keys = await this.storage.listKeys(hlsPrefixForStorageKey(video.storageKey));
      if (keys.length) await this.storage.deleteObjects(keys);
    } catch {
      // Best-effort: the DB row is gone, so no signed URL will ever be issued.
    }
    return { message: 'Video deleted' };
  }

  /**
   * Reset a video to PENDING so the packaging worker picks it up again.
   * Used after a FAILED transcode (or to force a re-package). The worker
   * overwrites the same deterministic HLS keys, so no cleanup is needed.
   */
  async reprocessVideo(id: string) {
    const video = await this.getVideo(id);
    const exists = await this.storage.objectExists(video.storageKey);
    if (!exists) {
      throw new BadRequestException(
        'Cannot reprocess: the source video file is missing from storage',
      );
    }
    return this.prisma.video.update({
      where: { id },
      data: { processingStatus: 'PENDING', processingError: null },
      include: TAXONOMY_INCLUDE,
    });
  }

  async replaceVideo(id: string) {
    const video = await this.getVideo(id);
    const newKey = `videos/${randomUUID()}/source.mp4`;
    const uploadTtl = this.config.getOrThrow<number>('uploadTtlSec');
    if (video.pendingStorageKey) await this.storage.deleteObject(video.pendingStorageKey);
    await this.prisma.video.update({
      where: { id },
      data: { pendingStorageKey: newKey, processingStatus: 'PENDING' },
    });
    const uploadUrl = await this.storage.getPresignedPutUrl(newKey, 'video/mp4', uploadTtl);
    return { uploadUrl, storageKey: newKey, expiresInSec: uploadTtl };
  }

  async confirmReplaceVideo(id: string) {
    const video = await this.getVideo(id);
    if (!video.pendingStorageKey) {
      throw new BadRequestException('No staged replacement found — call /replace first');
    }
    const exists = await this.storage.objectExists(video.pendingStorageKey);
    if (!exists) {
      throw new BadRequestException('Replacement file not uploaded yet');
    }
    const oldKey = video.storageKey;
    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        storageKey: video.pendingStorageKey,
        pendingStorageKey: null,
        processingStatus: 'PENDING', // Stage 5 worker re-transcodes
      },
      include: TAXONOMY_INCLUDE,
    });
    await this.storage.deleteObject(oldKey);
    return updated;
  }

  // ========================================================== secure access

  /**
   * The single gate for content reads. Checks, in order:
   *   1. user active & not expired (already enforced by ActiveUserGuard)
   *   2. content exists + is PUBLISHED (+ video is READY)
   *   3. the requesting device is still valid
   *   4. default-deny permission check (item grant or category grant)
   * Every outcome is logged; denials feed the burst detector.
   *
   * Videos are served through the signed HLS manifest endpoint (AES-128
   * encrypted segments). The raw source.mp4 is NEVER handed out — that would
   * be a direct download of the file.
   */
  async requestAccess(
    userId: string,
    deviceId: string | undefined,
    kind: ContentKind,
    id: string,
    ip?: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    const content = await this.assertAccess(userId, deviceId, kind, id, ip);

    if (kind === 'video') {
      const base = this.config.getOrThrow<string>('apiPublicUrl').replace(/\/+$/, '');
      const url = `${base}/videos/${id}/manifest`;
      await this.logGranted(userId, deviceId, kind, id, ip);
      return { url, expiresInSec: this.config.getOrThrow<number>('videoAccessTtlSec') };
    }

    const ttl = this.config.getOrThrow<number>('pdfAccessTtlSec');
    const url = await this.storage.getPresignedGetUrl(content.storageKey, ttl);

    await this.logGranted(userId, deviceId, kind, id, ip);
    return { url, expiresInSec: ttl };
  }

  /**
   * Shared access gate used by requestAccess() AND the HLS manifest service.
   * Runs every check and logs denials; returns the content row on success.
   * Success logging is left to the caller (it happens once access is issued).
   */
  async assertAccess(
    userId: string,
    deviceId: string | undefined,
    kind: ContentKind,
    id: string,
    ip?: string,
  ) {
    const content =
      kind === 'pdf'
        ? await this.prisma.pdf.findUnique({ where: { id } })
        : await this.prisma.video.findUnique({ where: { id } });

    if (!content) {
      await this.logDenied(userId, deviceId, kind, id, 'not_found', ip);
      throw new NotFoundException(`${kind === 'pdf' ? 'PDF' : 'Video'} not found`);
    }

    if (content.status !== ContentStatus.PUBLISHED) {
      await this.logDenied(userId, deviceId, kind, id, 'not_published', ip);
      throw new ForbiddenException('Content is not available');
    }

    if (kind === 'video' && (content as { processingStatus: string }).processingStatus !== 'READY') {
      await this.logDenied(userId, deviceId, kind, id, 'not_ready', ip);
      throw new ForbiddenException('Video is still being processed');
    }

    if (deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
      if (!device || device.userId !== userId || device.revoked) {
        await this.logDenied(userId, deviceId, kind, id, 'device_invalid', ip);
        throw new ForbiddenException('Device session is no longer valid');
      }
    }

    const allowed = await this.permissions.canAccess(
      userId,
      kind === 'pdf' ? PermissionTarget.PDF : PermissionTarget.VIDEO,
      { id: content.id, categoryId: content.categoryId },
    );
    if (!allowed) {
      await this.logDenied(userId, deviceId, kind, id, 'no_permission', ip);
      throw new ForbiddenException('You do not have access to this content');
    }

    return content;
  }

  /** Log a granted access (a content open). Public so the manifest service can log too. */
  async logGranted(
    userId: string,
    deviceId: string | undefined,
    kind: ContentKind,
    contentId: string,
    ip?: string,
  ): Promise<void> {
    await this.prisma.contentEvent.create({
      data: {
        userId,
        deviceId,
        contentType: kind,
        contentId,
        event: 'access_granted',
        meta: { ip: ip ?? null },
      },
    });
  }

  /** Log a denial and raise an alert on bursts (>10 denials / 5 min / user). */
  private async logDenied(
    userId: string,
    deviceId: string | undefined,
    kind: ContentKind,
    contentId: string,
    reason: string,
    ip?: string,
  ): Promise<void> {
    await this.prisma.contentEvent.create({
      data: {
        userId,
        deviceId,
        contentType: kind,
        contentId,
        event: 'access_denied',
        meta: { reason, ip: ip ?? null },
      },
    });

    const key = `denied:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, DENIED_WINDOW_SEC);
    if (count === DENIED_BURST_THRESHOLD + 1) {
      await this.prisma.securityAlert.create({
        data: {
          type: AlertType.DENIED_BURST,
          userId,
          detail: { count, windowSec: DENIED_WINDOW_SEC, contentType: kind, contentId },
        },
      });
    }
  }

  // ================================================================= library

  /** Published content the user may access (server-side filtered). */
  async libraryPdfs(userId: string, query: ListContentQuery) {
    const { itemIds, categoryIds } = await this.permissions.accessibleIds(
      userId,
      PermissionTarget.PDF,
    );
    const base = this.accessFilter(itemIds, categoryIds);
    if (!base) return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20 };
    const { where, page, limit } = this.buildListWhere(query, {
      status: ContentStatus.PUBLISHED,
      ...base,
    });
    const pdfWhere = where as Prisma.PdfWhereInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.pdf.count({ where: pdfWhere }),
      this.prisma.pdf.findMany({
        where: pdfWhere,
        include: TAXONOMY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async libraryVideos(userId: string, query: ListContentQuery) {
    const { itemIds, categoryIds } = await this.permissions.accessibleIds(
      userId,
      PermissionTarget.VIDEO,
    );
    const base = this.accessFilter(itemIds, categoryIds);
    if (!base) return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20 };
    const { where, page, limit } = this.buildListWhere(query, {
      status: ContentStatus.PUBLISHED,
      processingStatus: 'READY',
      ...base,
    });
    const videoWhere = where as Prisma.VideoWhereInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.video.count({ where: videoWhere }),
      this.prisma.video.findMany({
        where: videoWhere,
        include: TAXONOMY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  /** Category -> subject -> chapter tree with counts of accessible items. */
  async libraryTree(userId: string) {
    const [pdfPerms, videoPerms] = await Promise.all([
      this.permissions.accessibleIds(userId, PermissionTarget.PDF),
      this.permissions.accessibleIds(userId, PermissionTarget.VIDEO),
    ]);

    const pdfFilter = this.accessFilter(pdfPerms.itemIds, pdfPerms.categoryIds);
    const videoFilter = this.accessFilter(videoPerms.itemIds, videoPerms.categoryIds);

    const [pdfByCat, videoByCat, pdfBySub, videoBySub, pdfByChap, videoByChap] =
      await Promise.all([
        pdfFilter
          ? this.prisma.pdf.groupBy({
              by: ['categoryId'],
              where: { status: ContentStatus.PUBLISHED, categoryId: { not: null }, ...pdfFilter },
              _count: { id: true },
            })
          : [],
        videoFilter
          ? this.prisma.video.groupBy({
              by: ['categoryId'],
              where: {
                status: ContentStatus.PUBLISHED,
                processingStatus: 'READY',
                categoryId: { not: null },
                ...videoFilter,
              },
              _count: { id: true },
            })
          : [],
        pdfFilter
          ? this.prisma.pdf.groupBy({
              by: ['subjectId'],
              where: { status: ContentStatus.PUBLISHED, subjectId: { not: null }, ...pdfFilter },
              _count: { id: true },
            })
          : [],
        videoFilter
          ? this.prisma.video.groupBy({
              by: ['subjectId'],
              where: {
                status: ContentStatus.PUBLISHED,
                processingStatus: 'READY',
                subjectId: { not: null },
                ...videoFilter,
              },
              _count: { id: true },
            })
          : [],
        pdfFilter
          ? this.prisma.pdf.groupBy({
              by: ['chapterId'],
              where: { status: ContentStatus.PUBLISHED, chapterId: { not: null }, ...pdfFilter },
              _count: { id: true },
            })
          : [],
        videoFilter
          ? this.prisma.video.groupBy({
              by: ['chapterId'],
              where: {
                status: ContentStatus.PUBLISHED,
                processingStatus: 'READY',
                chapterId: { not: null },
                ...videoFilter,
              },
              _count: { id: true },
            })
          : [],
      ]);

    const sum = (
      rows: {
        categoryId?: string | null;
        subjectId?: string | null;
        chapterId?: string | null;
        _count?: { id: number } | null;
      }[],
      key: 'categoryId' | 'subjectId' | 'chapterId',
    ) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = r[key];
        if (k) map.set(k, (map.get(k) ?? 0) + (r._count?.id ?? 0));
      }
      return map;
    };
    const catCount = sum([...pdfByCat, ...videoByCat], 'categoryId');
    const subCount = sum([...pdfBySub, ...videoBySub], 'subjectId');
    const chapCount = sum([...pdfByChap, ...videoByChap], 'chapterId');

    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        subjects: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { chapters: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      itemCount: catCount.get(c.id) ?? 0,
      subjects: c.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        itemCount: subCount.get(s.id) ?? 0,
        chapters: s.chapters.map((ch) => ({
          id: ch.id,
          name: ch.name,
          itemCount: chapCount.get(ch.id) ?? 0,
        })),
      })),
    }));
  }

  // ----------------------------------------------------------------- helpers

  /** OR-filter from permission grants; null when the user has no access at all. */
  private accessFilter(
    itemIds: string[],
    categoryIds: string[],
  ): Record<string, unknown> | null {
    const or: Record<string, unknown>[] = [];
    if (itemIds.length) or.push({ id: { in: itemIds } });
    if (categoryIds.length) or.push({ categoryId: { in: categoryIds } });
    return or.length ? { OR: or } : null;
  }

  private buildListWhere(
    query: ListContentQuery,
    base: Record<string, unknown> = {},
  ): { where: Record<string, unknown>; page: number; limit: number } {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = { ...base };
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.chapterId) where.chapterId = query.chapterId;
    // Admin-only status filter: library callers always pass PUBLISHED in base.
    if (query.status) where.status = query.status;
    return { where, page, limit };
  }
}
