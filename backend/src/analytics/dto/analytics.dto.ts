import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Whitelist of analytics event types the app may report. Anything else is
 * rejected by validation — the server never stores unknown event types.
 * (Server-side events like access_granted / access_denied / login_success
 * are written by the backend itself and are intentionally NOT in this list.)
 */
export const ANALYTICS_EVENT_TYPES = [
  'content_open',
  'pdf_close',
  'video_play',
  'video_pause',
  'video_heartbeat',
  'video_complete',
  'video_seek',
  // Device-level event: no content attached. The server writes a
  // ROOT_DETECTED security alert when it sees this (best-effort).
  'root_detected',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export class AnalyticsEventDto {
  @IsIn(ANALYTICS_EVENT_TYPES as unknown as string[])
  type!: AnalyticsEventType;

  /** Null for device-level events (e.g. root_detected). */
  @IsOptional()
  @IsIn(['pdf', 'video'])
  contentType?: 'pdf' | 'video';

  /** Null for device-level events (e.g. root_detected). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentId?: string;

  /** Player position in seconds (heartbeats, seeks). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  positionSec?: number;

  /** Total media duration in seconds (informational). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  meta?: Record<string, unknown>;
}

export class EventBatchDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}

export const TIMESERIES_METRICS = ['opens', 'plays', 'watch_time', 'logins', 'signups'] as const;

export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];

export class TimeseriesQuery {
  @IsIn(TIMESERIES_METRICS as unknown as string[])
  metric!: TimeseriesMetric;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
