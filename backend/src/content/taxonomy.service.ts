import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateChapterDto,
  CreateSubjectDto,
  UpdateCategoryDto,
  UpdateChapterDto,
  UpdateSubjectDto,
} from './dto/content.dto';

/** Admin CRUD for the category -> subject -> chapter taxonomy tree. */
@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ categories --

  async listCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { subjects: true, pdfs: true, videos: true } },
      },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.requireCategory(id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.requireCategory(id);
    // Subjects/chapters cascade; linked PDFs/videos keep their rows with
    // categoryId set to null (onDelete: SetNull in the schema).
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  // ------------------------------------------------------------- subjects --

  async listSubjects(categoryId?: string) {
    const where: Prisma.SubjectWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    return this.prisma.subject.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { chapters: true, pdfs: true, videos: true } },
      },
    });
  }

  async createSubject(dto: CreateSubjectDto) {
    await this.requireCategory(dto.categoryId);
    return this.prisma.subject.create({ data: dto });
  }

  async updateSubject(id: string, dto: UpdateSubjectDto) {
    await this.requireSubject(id);
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async deleteSubject(id: string) {
    await this.requireSubject(id);
    await this.prisma.subject.delete({ where: { id } });
    return { message: 'Subject deleted' };
  }

  // ------------------------------------------------------------- chapters --

  async listChapters(subjectId?: string) {
    const where: Prisma.ChapterWhereInput = {};
    if (subjectId) where.subjectId = subjectId;
    return this.prisma.chapter.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        subject: {
          select: { id: true, name: true, category: { select: { id: true, name: true } } },
        },
        _count: { select: { pdfs: true, videos: true } },
      },
    });
  }

  async createChapter(dto: CreateChapterDto) {
    await this.requireSubject(dto.subjectId);
    return this.prisma.chapter.create({ data: dto });
  }

  async updateChapter(id: string, dto: UpdateChapterDto) {
    await this.requireChapter(id);
    return this.prisma.chapter.update({ where: { id }, data: dto });
  }

  async deleteChapter(id: string) {
    await this.requireChapter(id);
    await this.prisma.chapter.delete({ where: { id } });
    return { message: 'Chapter deleted' };
  }

  // ---------------------------------------------------------------- helpers --

  private async requireCategory(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  private async requireSubject(id: string) {
    const row = await this.prisma.subject.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Subject not found');
    return row;
  }

  private async requireChapter(id: string) {
    const row = await this.prisma.chapter.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Chapter not found');
    return row;
  }
}
