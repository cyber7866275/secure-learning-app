import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAnalyticsController, AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
