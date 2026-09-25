import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GrantPermissionDto {
  @IsString()
  @MaxLength(100)
  userId!: string;

  /** pdf | video | category — maps to the PermissionTarget enum. */
  @IsIn(['pdf', 'video', 'category'])
  contentType!: 'pdf' | 'video' | 'category';

  @IsString()
  @MaxLength(100)
  contentId!: string;

  /** ISO-8601 datetime or null (no expiry). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'expiresAt must be an ISO-8601 datetime or null',
  })
  expiresAt?: string | null;
}

export class ListPermissionsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;

  @IsOptional()
  @IsEnum(['PDF', 'VIDEO', 'CATEGORY'] as any)
  target?: 'PDF' | 'VIDEO' | 'CATEGORY';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
