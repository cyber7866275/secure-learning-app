import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HlsManifestGuard } from './hls-manifest.guard';
import { HlsManifestService } from './hls-manifest.service';

/**
 * GET /videos/:id/manifest — the only way clients stream video.
 *
 * Without query params: JWT required (HlsManifestGuard delegates to
 * JwtAuthGuard + ActiveUserGuard); returns the master playlist with variant
 * URIs rewritten to tokenized sub-requests.
 *
 * With ?variant=&token=: the HLS token is verified and all checks re-run
 * inside the service (user active, published + READY, permission granted).
 * Segment and key URIs come back as 10-minute presigned storage URLs.
 */
@Controller('videos')
export class HlsManifestController {
  constructor(private readonly manifests: HlsManifestService) {}

  @Get(':id/manifest')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @UseGuards(HlsManifestGuard)
  manifest(
    @Param('id') id: string,
    @Query('variant') variant: string | undefined,
    @Query('token') token: string | undefined,
    @CurrentUser('userId') userId: string | undefined,
    @CurrentUser('deviceId') deviceId: string | undefined,
    @Req() req: Request,
  ): Promise<string> {
    if (variant && token) {
      return this.manifests.serveVariant(id, variant, token);
    }
    if (!userId) {
      // Should be unreachable (guard), but fail closed regardless.
      throw new UnauthorizedException('Authentication required');
    }
    return this.manifests.serveMaster(userId, deviceId, id, req.ip);
  }
}
