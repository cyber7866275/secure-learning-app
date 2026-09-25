import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { EventBatchDto, TimeseriesQuery } from './dto/analytics.dto';

/**
 * App-facing event ingestion. Throttled to ~60 batches/min per user: the
 * Android app uploads every 15 minutes via WorkManager, so this limit is
 * generous for legitimate use and tight against event-spam abuse.
 */
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('analytics/events')
  ingest(
    @CurrentUser('userId') userId: string,
    @CurrentUser('deviceId') deviceId: string | undefined,
    @Body() dto: EventBatchDto,
  ) {
    return this.analytics.ingest(userId, deviceId, dto.events);
  }
}

/** Admin analytics dashboards. Read-only. */
@UseGuards(AdminGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analytics.overview();
  }

  @Get('timeseries')
  timeseries(@Query() query: TimeseriesQuery) {
    return this.analytics.timeseries(query.metric, query.days ?? 30);
  }

  @Get('content/:contentType/:id')
  contentStats(@Param('contentType') contentType: string, @Param('id') id: string) {
    if (contentType !== 'pdf' && contentType !== 'video') {
      throw new BadRequestException('contentType must be pdf or video');
    }
    return this.analytics.contentStats(contentType, id);
  }

  @Get('users/:userId')
  userStats(@Param('userId') userId: string) {
    return this.analytics.userStats(userId);
  }
}
