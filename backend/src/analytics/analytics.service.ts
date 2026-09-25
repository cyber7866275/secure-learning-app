import { BadRequestException, Injectable } from '@nestjs/common';
import { AlertType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsEventDto, TimeseriesMetric } from './dto/analytics.dto';
import {
  bucketByDay,
  computeWatchTimeSec,
  groupHeartbeatsByDay,
  type DayBucket,
} from './analytics.util';

/**
 * Analytics ingestion + aggregation.
 *
 * Metric definitions (documented because the admin UI depends on them):
 * - "opens":        contentEvent rows with event = 'access_granted'.
 *                   Server-authoritative: the backend writes this itself on
 *                   every successful /access call, so it can't be spoofed or
 *                   lost by a misbehaving client. The app's own
 *                   'content_open' event is client confirmation and is kept
 *                   for per-user recent-activity feeds.
 * - "plays":        event = 'video_play' (app-reported; a manifest that was
 *                   granted but never played is not a play).
 * - "watch_time":   computed from 'video_heartbeat' rows via
 *                   computeWatchTimeSec (see analytics.util.ts).
 * - "logins":       login_attempts with success = true.
 * - "signups":      users.createdAt.
 *
 * Timeseries bucketing is done in JS over the requested window (pure
 * functions, tested). If event volume ever makes this slow, move it to
 * SQL date_trunc aggregation or a materialized daily rollup table.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ingest a batch of app-reported events. Returns the accepted count. */
  async ingest(
    userId: string,
    deviceId: string | undefined,
    events: AnalyticsEventDto[],
  ): Promise<{ received: number }> {
    if (events.length === 0) return { received: 0 };
    await this.prisma.contentEvent.createMany({
      data: events.map((e) => ({
        userId,
        deviceId: deviceId ?? null,
        contentType: e.contentType ?? null,
        contentId: e.contentId ?? null,
        event: e.type,
        meta: {
          ...(e.positionSec !== undefined ? { positionSec: e.positionSec } : {}),
          ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
          ...(e.meta ?? {}),
        },
      })),
    });
    // Device-level security signal: a rooted device reporting in. Best-effort,
    // deduplicated per user per 24h — analytics must never break the app.
    if (events.some((e) => e.type === 'root_detected')) {
      await this.raiseRootAlert(userId, deviceId).catch(() => null);
    }
    return { received: events.length };
  }

  /**
   * Writes a ROOT_DETECTED security alert, at most one per user per 24h.
   * A rooted device can trivially bypass client-side checks, so this is a
   * *signal*, not a verdict — the Play Integrity verdict (Stage 7) is the
   * hardware-backed counterpart. Never throws.
   */
  private async raiseRootAlert(userId: string, deviceId?: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.securityAlert.findFirst({
      where: { userId, type: AlertType.ROOT_DETECTED, createdAt: { gte: since } },
    });
    if (recent) return;
    await this.prisma.securityAlert.create({
      data: {
        type: AlertType.ROOT_DETECTED,
        userId,
        detail: { deviceId: deviceId ?? null, source: 'app-report' },
      },
    });
  }

  async overview() {
    const todayStart = startOfTodayUtc();
    const window30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalPdfs,
      totalVideos,
      opensToday,
      playsToday,
      deniedToday,
      unseenAlerts,
      heartbeatRows,
      eventUserRows,
      loginUserRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.pdf.count(),
      this.prisma.video.count(),
      this.prisma.contentEvent.count({
        where: { event: 'access_granted', createdAt: { gte: todayStart } },
      }),
      this.prisma.contentEvent.count({
        where: { event: 'video_play', createdAt: { gte: todayStart } },
      }),
      this.prisma.contentEvent.count({
        where: { event: 'access_denied', createdAt: { gte: todayStart } },
      }),
      this.prisma.securityAlert.count({ where: { seen: false } }),
      this.prisma.contentEvent.findMany({
        where: { event: 'video_heartbeat', createdAt: { gte: todayStart } },
        select: { createdAt: true },
      }),
      this.prisma.contentEvent.findMany({
        where: { createdAt: { gte: window30d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.loginAttempt.findMany({
        where: { success: true, createdAt: { gte: window30d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const active = new Set<string>();
    for (const r of eventUserRows) active.add(r.userId);
    for (const r of loginUserRows) if (r.userId) active.add(r.userId);

    return {
      totalUsers,
      activeUsers30d: active.size,
      totalPdfs,
      totalVideos,
      opensToday,
      playsToday,
      watchTimeTodaySec: computeWatchTimeSec(heartbeatRows.map((r) => r.createdAt)),
      deniedToday,
      unseenAlerts,
    };
  }

  async timeseries(metric: TimeseriesMetric, days = 30): Promise<DayBucket[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    switch (metric) {
      case 'opens': {
        const rows = await this.prisma.contentEvent.findMany({
          where: { event: 'access_granted', createdAt: { gte: since } },
          select: { createdAt: true },
        });
        return bucketByDay(rows.map((r) => r.createdAt), days);
      }
      case 'plays': {
        const rows = await this.prisma.contentEvent.findMany({
          where: { event: 'video_play', createdAt: { gte: since } },
          select: { createdAt: true },
        });
        return bucketByDay(rows.map((r) => r.createdAt), days);
      }
      case 'watch_time': {
        const rows = await this.prisma.contentEvent.findMany({
          where: { event: 'video_heartbeat', createdAt: { gte: since } },
          select: { createdAt: true },
        });
        const groups = groupHeartbeatsByDay(rows.map((r) => r.createdAt));
        const buckets = bucketByDay([], days);
        for (const b of buckets) {
          b.value = computeWatchTimeSec(groups.get(b.date) ?? []);
        }
        return buckets;
      }
      case 'logins': {
        const rows = await this.prisma.loginAttempt.findMany({
          where: { success: true, createdAt: { gte: since } },
          select: { createdAt: true },
        });
        return bucketByDay(rows.map((r) => r.createdAt), days);
      }
      case 'signups': {
        const rows = await this.prisma.user.findMany({
          where: { createdAt: { gte: since } },
          select: { createdAt: true },
        });
        return bucketByDay(rows.map((r) => r.createdAt), days);
      }
    }
  }

  async contentStats(contentType: 'pdf' | 'video', id: string) {
    // Separate calls per type: Prisma's pdf/video delegates are distinct
    // types, so a union variable is not callable.
    const content =
      contentType === 'pdf'
        ? await this.prisma.pdf.findUnique({ where: { id }, select: { id: true, title: true } })
        : await this.prisma.video.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!content) throw new BadRequestException('Content not found');

    const [opens, uniqueUsers, heartbeatRows, lastOpened] = await Promise.all([
      this.prisma.contentEvent.count({
        where: { contentType, contentId: id, event: 'access_granted' },
      }),
      this.prisma.contentEvent.findMany({
        where: { contentType, contentId: id, event: 'access_granted' },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.contentEvent.findMany({
        where: { contentType, contentId: id, event: 'video_heartbeat' },
        select: { createdAt: true, userId: true },
      }),
      this.prisma.contentEvent.findFirst({
        where: { contentType, contentId: id, event: 'access_granted' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    // Watch time per user (heartbeats of different users must not mix).
    const byUser = new Map<string, Date[]>();
    for (const r of heartbeatRows) {
      const arr = byUser.get(r.userId);
      if (arr) arr.push(r.createdAt);
      else byUser.set(r.userId, [r.createdAt]);
    }
    let totalWatchTimeSec = 0;
    for (const ts of byUser.values()) totalWatchTimeSec += computeWatchTimeSec(ts);

    return {
      id: content.id,
      title: content.title,
      opens,
      uniqueUsers: uniqueUsers.length,
      totalWatchTimeSec,
      lastOpenedAt: lastOpened?.createdAt ?? null,
    };
  }

  async userStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const [pdfRows, videoRows, heartbeatRows, recentEvents, lastEvent, lastLogin] =
      await Promise.all([
        this.prisma.contentEvent.findMany({
          where: { userId, contentType: 'pdf', event: 'access_granted' },
          select: { contentId: true },
          distinct: ['contentId'],
        }),
        this.prisma.contentEvent.findMany({
          where: { userId, contentType: 'video', event: 'access_granted' },
          select: { contentId: true },
          distinct: ['contentId'],
        }),
        this.prisma.contentEvent.findMany({
          where: { userId, event: 'video_heartbeat' },
          select: { createdAt: true, contentId: true },
        }),
        this.prisma.contentEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { contentType: true, contentId: true, event: true, createdAt: true },
        }),
        this.prisma.contentEvent.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.loginAttempt.findFirst({
          where: { userId, success: true },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

    // Group heartbeats by content so different videos never mix.
    // (contentId is null only for device-level events, which are never
    // heartbeats — the filter below is just for the type checker.)
    const byContent = new Map<string, Date[]>();
    for (const r of heartbeatRows) {
      if (!r.contentId) continue;
      const arr = byContent.get(r.contentId);
      if (arr) arr.push(r.createdAt);
      else byContent.set(r.contentId, [r.createdAt]);
    }
    let totalWatchTimeSec = 0;
    for (const ts of byContent.values()) totalWatchTimeSec += computeWatchTimeSec(ts);

    const lastActiveAt = [lastEvent?.createdAt, lastLogin?.createdAt]
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0] as Date | undefined;

    return {
      user,
      pdfsOpened: pdfRows.length,
      videosPlayed: videoRows.length,
      totalWatchTimeSec,
      lastActiveAt: lastActiveAt ?? null,
      recentEvents,
    };
  }
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
