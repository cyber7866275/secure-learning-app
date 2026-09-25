import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { StorageModule } from '../storage/storage.module';
import { AdminBannersController, PublicBannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { AdminContentController } from './admin-content.controller';
import { ContentService } from './content.service';
import { LibraryController } from './library.controller';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  imports: [StorageModule, PermissionsModule],
  controllers: [
    TaxonomyController,
    AdminContentController,
    LibraryController,
    AdminBannersController,
    PublicBannersController,
  ],
  providers: [TaxonomyService, ContentService, BannersService],
  exports: [ContentService],
})
export class ContentModule {}
