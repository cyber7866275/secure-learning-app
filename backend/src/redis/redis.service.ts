import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Shared Redis connection (OTP storage, refresh-token blacklist, rate-limit
 * backing for later stages). Other modules inject this and use `.client`.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  public readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redisUrl'), {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.client.on('error', (err) => {
      // Never crash the process on a transient Redis blip; callers will
      // surface command errors themselves.
      console.error('[redis] connection error:', err.message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
