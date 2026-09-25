import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '@prisma/client';

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export class CreateUserDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Matches(PHONE_RE, { message: 'phone must be in E.164 format' })
  phone!: string;

  @IsOptional()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDevices?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDevices?: number;

  /**
   * ISO-8601 date string, or null to clear. Past dates effectively expire
   * the account immediately (login + refresh both enforce it).
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'accessExpiresAt must be an ISO-8601 datetime or null',
  })
  accessExpiresAt?: string | null;
}

export class ListUsersQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'BLOCKED';

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
