import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { StorageModule } from '../storage/storage.module';
import { HlsManifestController } from './hls-manifest.controller';
import { HlsManifestGuard } from './hls-manifest.guard';
import { HlsManifestService } from './hls-manifest.service';
import { HlsTokenService } from './hls-token.service';
import { VideoWorkerService } from './video-worker.service';

/**
 * Stage 5 — secure video streaming.
 *
 * Shipped protection: HLS with AES-128 segment encryption (per-video random
 * key, per-segment random IV), served exclusively through the authorized
 * manifest endpoint with short-lived presigned segment/key URLs.
 *
 * WIDEVINE UPGRADE PATH (not faked — honestly documented):
 *   1. Sign up with a DRM license provider (Axinom, BuyDRM, EZDRM) or use a
 *      managed pipeline (Cloudflare Stream / Mux) that includes DRM.
 *   2. At package time, encrypt with Widevine (cbcs) instead of / in addition
 *      to AES-128 and store the returned key IDs in Video.drmKeyId (field
 *      already exists on the model).
 *   3. In hls-manifest.service.ts, emit EXT-X-KEY with KEYFORMAT
 *      "urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" pointing at the license
 *      server, and mint per-user license tokens alongside the HLS tokens.
 *   4. In the Android app, attach a DrmSessionManager to ExoPlayer
 *      (see the hook comment in VideoPlayerViewModel).
 * Until then, AES-128 + signed URLs + watermark is the shipped protection,
 * which stops all casual piracy (no direct file access, no stable URLs).
 */
@Module({
  imports: [ContentModule, StorageModule, PermissionsModule],
  controllers: [HlsManifestController],
  providers: [VideoWorkerService, HlsManifestService, HlsTokenService, HlsManifestGuard],
})
export class VideoProcessingModule {}
