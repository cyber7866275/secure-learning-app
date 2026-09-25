import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AlertsQuery extends PaginationQuery {
  /** When true, only unseen alerts are returned. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unseenOnly?: boolean;
}

export class LoginAttemptsQuery extends PaginationQuery {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  success?: boolean;
}
