import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [PrismaModule],
  controllers: [SecurityController],
  providers: [SecurityService],
})
export class SecurityModule {}
