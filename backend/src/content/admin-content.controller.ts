import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { AdminGuard } from '../common/guards/admin.guard';
import { ContentService } from './content.service';
import {
  CreatePdfDto,
  CreateVideoDto,
  ListContentQuery,
  UpdatePdfDto,
  UpdateVideoDto,
} from './dto/content.dto';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  // ------------------------------------------------------------------ pdfs --

  @Post('pdfs')
  createPdf(@Body() dto: CreatePdfDto) {
    return this.content.createPdf(dto);
  }

  @Get('pdfs')
  listPdfs(@Query() query: ListContentQuery) {
    return this.content.listPdfs(query);
  }

  @Get('pdfs/:id')
  getPdf(@Param('id') id: string) {
    return this.content.getPdf(id);
  }

  @Patch('pdfs/:id')
  updatePdf(@Param('id') id: string, @Body() dto: UpdatePdfDto) {
    return this.content.updatePdf(id, dto);
  }

  @Post('pdfs/:id/publish')
  publishPdf(@Param('id') id: string) {
    return this.content.setPdfStatus(id, ContentStatus.PUBLISHED);
  }

  @Post('pdfs/:id/unpublish')
  unpublishPdf(@Param('id') id: string) {
    return this.content.setPdfStatus(id, ContentStatus.DRAFT);
  }

  @Post('pdfs/:id/hide')
  hidePdf(@Param('id') id: string) {
    return this.content.setPdfStatus(id, ContentStatus.HIDDEN);
  }

  @Post('pdfs/:id/replace')
  replacePdf(@Param('id') id: string) {
    return this.content.replacePdf(id);
  }

  @Post('pdfs/:id/replace/confirm')
  confirmReplacePdf(@Param('id') id: string) {
    return this.content.confirmReplacePdf(id);
  }

  @Delete('pdfs/:id')
  deletePdf(@Param('id') id: string) {
    return this.content.deletePdf(id);
  }

  // ---------------------------------------------------------------- videos --

  @Post('videos')
  createVideo(@Body() dto: CreateVideoDto) {
    return this.content.createVideo(dto);
  }

  @Get('videos')
  listVideos(@Query() query: ListContentQuery) {
    return this.content.listVideos(query);
  }

  @Get('videos/:id')
  getVideo(@Param('id') id: string) {
    return this.content.getVideo(id);
  }

  @Patch('videos/:id')
  updateVideo(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.content.updateVideo(id, dto);
  }

  @Post('videos/:id/publish')
  publishVideo(@Param('id') id: string) {
    return this.content.setVideoStatus(id, ContentStatus.PUBLISHED);
  }

  @Post('videos/:id/unpublish')
  unpublishVideo(@Param('id') id: string) {
    return this.content.setVideoStatus(id, ContentStatus.DRAFT);
  }

  @Post('videos/:id/hide')
  hideVideo(@Param('id') id: string) {
    return this.content.setVideoStatus(id, ContentStatus.HIDDEN);
  }

  @Post('videos/:id/replace')
  replaceVideo(@Param('id') id: string) {
    return this.content.replaceVideo(id);
  }

  @Post('videos/:id/replace/confirm')
  confirmReplaceVideo(@Param('id') id: string) {
    return this.content.confirmReplaceVideo(id);
  }

  /**
   * Reset a video to PENDING so the packaging worker picks it up again.
   * For FAILED transcodes (the worker stores the reason in processingError).
   */
  @Post('videos/:id/reprocess')
  reprocessVideo(@Param('id') id: string) {
    return this.content.reprocessVideo(id);
  }

  @Delete('videos/:id')
  deleteVideo(@Param('id') id: string) {
    return this.content.deleteVideo(id);
  }
}
