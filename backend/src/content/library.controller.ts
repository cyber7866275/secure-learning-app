import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ContentService } from './content.service';
import { ListContentQuery } from './dto/content.dto';

/**
 * User-facing content routes. ActiveUserGuard re-checks the account on every
 * request, so a blocked/expired user loses access immediately.
 */
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller()
export class LibraryController {
  constructor(private readonly content: ContentService) {}

  /**
   * The secure access gate: server-side permission check, then a short-lived
   * presigned GET URL (5 min PDF / 10 min video). The storage key is never
   * exposed to the client.
   */
  @Post('pdfs/:id/access')
  accessPdf(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('deviceId') deviceId: string | undefined,
    @Req() req: Request,
  ) {
    return this.content.requestAccess(userId, deviceId, 'pdf', id, req.ip);
  }

  @Post('videos/:id/access')
  accessVideo(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('deviceId') deviceId: string | undefined,
    @Req() req: Request,
  ) {
    return this.content.requestAccess(userId, deviceId, 'video', id, req.ip);
  }

  /** Only published PDFs the user has permission for. */
  @Get('library/pdfs')
  libraryPdfs(@CurrentUser('userId') userId: string, @Query() query: ListContentQuery) {
    return this.content.libraryPdfs(userId, query);
  }

  /** Only published + transcoded (READY) videos the user has permission for. */
  @Get('library/videos')
  libraryVideos(@CurrentUser('userId') userId: string, @Query() query: ListContentQuery) {
    return this.content.libraryVideos(userId, query);
  }

  /** Category -> subject -> chapter tree with accessible-item counts. */
  @Get('library/tree')
  libraryTree(@CurrentUser('userId') userId: string) {
    return this.content.libraryTree(userId);
  }
}
