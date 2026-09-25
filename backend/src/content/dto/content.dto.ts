import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---------------------------------------------------------------- taxonomy --

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(['PDF', 'VIDEO', 'BOTH'])
  type?: 'PDF' | 'VIDEO' | 'BOTH';

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(['PDF', 'VIDEO', 'BOTH'])
  type?: 'PDF' | 'VIDEO' | 'BOTH';

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateSubjectDto {
  @IsString()
  @MaxLength(100)
  categoryId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateChapterDto {
  @IsString()
  @MaxLength(100)
  subjectId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ------------------------------------------------------------------ content --

/** Taxonomy reference for a PDF/Video. Null clears the link on update. */
export class TaxonomyRefDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  chapterId?: string | null;
}

export class CreatePdfDto extends TaxonomyRefDto {
  @IsString()
  @MaxLength(200)
  title!: string;
}

export class UpdatePdfDto extends TaxonomyRefDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class CreateVideoDto extends TaxonomyRefDto {
  @IsString()
  @MaxLength(200)
  title!: string;
}

export class UpdateVideoDto extends TaxonomyRefDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailKey?: string | null;
}

export class ListContentQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  chapterId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN'])
  status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

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

// ------------------------------------------------------------------ banners --

export class CreateBannerDto {
  @IsString()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
