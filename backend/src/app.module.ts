import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/configuration';
import { ContentModule } from './content/content.module';
import { DevicesModule } from './devices/devices.module';
import { IntegrityModule } from './integrity/integrity.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './security/security.module';
import { SettingsModule } from './settings/settings.module';
import { TokensModule } from './tokens/tokens.module';
import { UsersModule } from './users/users.module';
import { VideoProcessingModule } from './video-processing/video-processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
      cache: true,
    }),
    // Global rate limiting. Named throttlers let routes opt into the
    // stricter "auth" bucket via @Throttle({ auth: ... }).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 60_000, limit: 30 },
    ]),
    PrismaModule,
    RedisModule,
    TokensModule,
    DevicesModule,
    AuthModule,
    UsersModule,
    ContentModule,
    SettingsModule,
    SecurityModule,
    AnalyticsModule,
    VideoProcessingModule,
    IntegrityModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
