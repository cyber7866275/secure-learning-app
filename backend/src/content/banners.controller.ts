import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { BannersService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/content.dto';

@UseGuards(AdminGuard)
@Controller('admin/banners')
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.listAdmin();
  }

  @Post()
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.banners.remove(id);
  }
}

/** Public home-screen feed. Deliberately unauthenticated: banners are not sensitive. */
@Controller('banners')
export class PublicBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.listPublic();
  }
}
