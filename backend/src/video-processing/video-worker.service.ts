import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { hlsPrefixForStorageKey, packageToHls } from './hls-ffmpeg';

/**
 * In-process video packaging worker (MVP — no queue infra needed).
 *
 * Every VIDEO_WORKER_INTERVAL_MS it atomically claims ONE video with
 * processingStatus=PENDING (updateMany with the PENDING predicate, so two
 * API replicas can never double-process), then:
 *   1. downloads source.mp4 from private storage to a temp dir
 *   2. ffmpeg -> 3 HLS renditions (1080p/720p/480p), 6s segments, AES-128
 *   3. uploads master/variants/segments/key/thumbnail to videos/{uuid}/hls/
 *   4. marks the video READY (or FAILED with the reason in processingError)
 *   5. wipes the temp dir
 *
 * Scale note: for real load, replace this poller with a proper queue
 * (BullMQ + separate worker processes). The packageToHls() core stays the same.
 */
@Injectable()
export class VideoWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoWorkerService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (!this.config.get<boolean>('videoWorkerEnabled', true)) {
      this.logger.log('Video worker disabled (VIDEO_WORKER_ENABLED=false)');
      return;
    }
    const ms = this.config.get<number>('videoWorkerIntervalMs', 30_000);
    const timer = setInterval(() => void this.poll(), ms);
    // Prevent the timer from keeping the process alive on its own.
    timer.unref?.();
    this.scheduler.addInterval('video-worker', timer);
    this.logger.log(`Video worker polling every ${ms}ms`);
  }

  onModuleDestroy() {
    try {
      this.scheduler.deleteInterval('video-worker');
    } catch {
      // never registered (disabled) — nothing to do
    }
  }

  /** Poll entry: claim one PENDING video and process it. Single-flight. */
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const next = await this.prisma.video.findFirst({
        where: { processingStatus: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!next) return;

      // Atomic claim: only flips if still PENDING (lost races get count 0).
      const claimed = await this.prisma.video.updateMany({
        where: { id: next.id, processingStatus: 'PENDING' },
        data: { processingStatus: 'PROCESSING', processingError: null },
      });
      if (claimed.count === 0) return;

      await this.process(next.id);
    } catch (err) {
      this.logger.error(`Video worker poll failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async process(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) return;

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `hls-${videoId}-`));
    try {
      this.logger.log(`Packaging video ${videoId} (${video.title})`);
      const sourceBytes = await this.storage.getObjectBytes(video.storageKey);
      const inputPath = path.join(tmp, 'source.mp4');
      await fs.writeFile(inputPath, sourceBytes);

      const outDir = path.join(tmp, 'hls');
      const result = await packageToHls(inputPath, outDir, {
        ffmpegPath: this.config.get<string>('ffmpegPath', 'ffmpeg'),
        ffprobePath: this.config.get<string>('ffprobePath', 'ffprobe'),
      });

      const prefix = hlsPrefixForStorageKey(video.storageKey);
      let thumbnailKey: string | null = null;
      for (const f of result.files) {
        const data = await fs.readFile(f.absolutePath);
        const key = `${prefix}/${f.relativePath}`;
        await this.storage.putObject(key, data, f.contentType);
        if (f.relativePath === 'thumb.jpg') thumbnailKey = key;
      }

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          processingStatus: 'READY',
          processingError: null,
          durationSec: result.durationSec > 0 ? Math.round(result.durationSec) : null,
          thumbnailKey,
        },
      });
      this.logger.log(
        `Video ${videoId} READY (${result.files.length} objects, ${Math.round(result.durationSec)}s)`,
      );
    } catch (err) {
      const message = ((err as Error).message ?? 'unknown error').slice(0, 500);
      this.logger.error(`Video ${videoId} packaging FAILED: ${message}`);
      await this.prisma.video.update({
        where: { id: videoId },
        data: { processingStatus: 'FAILED', processingError: message },
      });
    } finally {
      // Temp dir held the unencrypted source + key — always wipe it.
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}
