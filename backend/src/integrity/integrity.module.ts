import { Module } from '@nestjs/common';
import { IntegrityService } from './integrity.service';

@Module({
  providers: [IntegrityService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
