import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/content.dto';

/** Home-screen banners / notices. Admin manages, app reads active ones. */
@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin() {
    return this.prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  /** Public feed for the app home screen: active only, ordered. */
  async listPublic() {
    return this.prisma.banner.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, body: true, imageKey: true, sortOrder: true },
    });
  }

  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({ data: dto });
  }

  async update(id: string, dto: UpdateBannerDto) {
    const row = await this.prisma.banner.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Banner not found');
    return this.prisma.banner.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const row = await this.prisma.banner.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Banner not found');
    await this.prisma.banner.delete({ where: { id } });
    return { message: 'Banner deleted' };
  }
}
