import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionTarget } from '@prisma/client';
import { ContentService } from '../content/content.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { hlsPrefixForStorageKey } from './hls-ffmpeg';
import { rewriteMasterPlaylist, rewriteVariantPlaylist } from './hls-playlist';
import { HlsTokenService } from './hls-token.service';

/**
 * Serves HLS manifests with per-request authorization.
 *
 * Two paths, one route (GET /videos/:id/manifest):
 *
 * 1. Master playlist — JWT path. The full access gate runs (published, READY,
 *    device valid, permission). Variant URIs in the returned master point back
 *    at this endpoint with a short-lived HMAC token (?variant=&token=).
 *
 * 2. Variant playlist — HLS-token path. ExoPlayer fetches these as plain
 *    sub-requests (no Authorization header possible per-URL), so the token in
 *    the query string is verified here AND the checks are re-run: user still
 *    active, video still published + READY, permission still granted.
 *    The device check is intentionally skipped on this path — it already ran
 *    on the master request seconds earlier, and the token is bound to the
 *    same (userId, videoId) with a 10-minute expiry.
 *
 * Every segment URI and the EXT-X-KEY URI are rewritten to presigned storage
 * URLs (hlsSegmentTtlSec). Nothing under videos/{uuid}/hls/ is ever directly
 * addressable by a client.
 */
@Injectable()
export class HlsManifestService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tokens: HlsTokenService,
    private readonly permissions: PermissionsService,
    private readonly content: ContentService,
  ) {}

  private apiBase(): string {
    return this.config.getOrThrow<string>('apiPublicUrl').replace(/\/+$/, '');
  }

  /** Master playlist for a JWT-authenticated request. */
  async serveMaster(
    userId: string,
    deviceId: string | undefined,
    videoId: string,
    ip?: string,
  ): Promise<string> {
    const video = await this.content.assertAccess(userId, deviceId, 'video', videoId, ip);
    await this.content.logGranted(userId, deviceId, 'video', videoId, ip);

    const prefix = hlsPrefixForStorageKey(video.storageKey);
    let master: Buffer;
    try {
      master = await this.storage.getObjectBytes(`${prefix}/master.m3u8`);
    } catch {
      throw new NotFoundException('Video stream is not available yet');
    }

    const token = this.tokens.issue(userId, videoId);
    const base = this.apiBase();
    return rewriteMasterPlaylist(master.toString('utf8'), (variant) => {
      if (!/^[a-z0-9]+$/i.test(variant)) {
        throw new BadRequestException('Unknown stream variant');
      }
      return (
        `${base}/videos/${videoId}/manifest` +
        `?variant=${encodeURIComponent(variant)}&token=${encodeURIComponent(token)}`
      );
    });
  }

  /** Variant playlist for an HLS-token request. Re-checks everything. */
  async serveVariant(videoId: string, variant: string, token: string): Promise<string> {
    const verified = this.tokens.verify(token, videoId);
    if (!verified) {
      throw new ForbiddenException('Invalid or expired stream token');
    }

    // The token is only 10 minutes old at most, but the account may have been
    // blocked since — re-check.
    const user = await this.prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== 'PUBLISHED' || video.processingStatus !== 'READY') {
      throw new ForbiddenException('Video is not available');
    }

    const allowed = await this.permissions.canAccess(user.id, PermissionTarget.VIDEO, {
      id: video.id,
      categoryId: video.categoryId,
    });
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this video');
    }

    if (!/^[a-z0-9]+$/i.test(variant)) {
      throw new BadRequestException('Unknown stream variant');
    }
    const prefix = hlsPrefixForStorageKey(video.storageKey);
    let raw: Buffer;
    try {
      raw = await this.storage.getObjectBytes(`${prefix}/${variant}.m3u8`);
    } catch {
      throw new NotFoundException('Stream variant not found');
    }

    const ttl = this.config.getOrThrow<number>('hlsSegmentTtlSec');
    return rewriteVariantPlaylist(raw.toString('utf8'), (fileName) =>
      this.storage.getPresignedGetUrl(`${prefix}/${fileName}`, ttl),
    );
  }
}
