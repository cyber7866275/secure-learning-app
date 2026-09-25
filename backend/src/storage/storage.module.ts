import { Module } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

/** Global storage provider: inject StorageService anywhere. */
@Module({
  providers: [{ provide: StorageService, useClass: S3StorageService }],
  exports: [StorageService],
})
export class StorageModule {}
