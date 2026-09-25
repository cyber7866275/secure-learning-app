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
import { AdminGuard } from '../common/guards/admin.guard';
import {
  CreateCategoryDto,
  CreateChapterDto,
  CreateSubjectDto,
  UpdateCategoryDto,
  UpdateChapterDto,
  UpdateSubjectDto,
} from './dto/content.dto';
import { TaxonomyService } from './taxonomy.service';

@UseGuards(AdminGuard)
@Controller('admin/taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  // -- categories ------------------------------------------------------------
  @Get('categories')
  listCategories() {
    return this.taxonomy.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.taxonomy.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.taxonomy.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.taxonomy.deleteCategory(id);
  }

  // -- subjects --------------------------------------------------------------
  @Get('subjects')
  listSubjects(@Query('categoryId') categoryId?: string) {
    return this.taxonomy.listSubjects(categoryId);
  }

  @Post('subjects')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.taxonomy.createSubject(dto);
  }

  @Patch('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.taxonomy.updateSubject(id, dto);
  }

  @Delete('subjects/:id')
  deleteSubject(@Param('id') id: string) {
    return this.taxonomy.deleteSubject(id);
  }

  // -- chapters --------------------------------------------------------------
  @Get('chapters')
  listChapters(@Query('subjectId') subjectId?: string) {
    return this.taxonomy.listChapters(subjectId);
  }

  @Post('chapters')
  createChapter(@Body() dto: CreateChapterDto) {
    return this.taxonomy.createChapter(dto);
  }

  @Patch('chapters/:id')
  updateChapter(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.taxonomy.updateChapter(id, dto);
  }

  @Delete('chapters/:id')
  deleteChapter(@Param('id') id: string) {
    return this.taxonomy.deleteChapter(id);
  }
}
