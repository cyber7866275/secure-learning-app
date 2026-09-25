import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * App-wide settings key-value store, managed from the admin panel
 * (Stage 3) and read by the Android app (Stage 4).
 */
@Injectable()
export class SettingsService {
  /** Keys the admin panel is allowed to write. Unknown keys are rejected. */
  static readonly ALLOWED_KEYS = [
    'screenshot_protection', // "true" | "false" — FLAG_SECURE on viewer/player
    'recording_protection', // "true" | "false" — FLAG_SECURE screen-record block
    'watermark_enabled', // "true" | "false" — dynamic watermark overlay
    'default_max_devices', // e.g. "2" — default device limit for new users
    'device_limit_mode', // "revoke-oldest" | "deny"
    // ---- Stage 7: device integrity ----
    'root_block_enabled', // "true" | "false" — block logins from rooted devices
    'integrity_enforcement', // "off" | "log" | "block" — Play Integrity verdict
  ] as const;

  static readonly DEFAULTS: Record<string, string> = {
    screenshot_protection: 'true',
    recording_protection: 'true',
    watermark_enabled: 'true',
    default_max_devices: '2',
    device_limit_mode: 'revoke-oldest',
    root_block_enabled: 'true',
    integrity_enforcement: 'log',
  };

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.appSetting.findMany();
    const map: Record<string, string> = { ...SettingsService.DEFAULTS };
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  async updateMany(settings: Record<string, string>): Promise<Record<string, string>> {
    const allowed = new Set<string>(SettingsService.ALLOWED_KEYS);
    const entries = Object.entries(settings);
    for (const [key] of entries) {
      if (!allowed.has(key)) {
        throw new Error(`Unknown setting key: ${key}`);
      }
    }
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.appSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        }),
      ),
    );
    return this.getAll();
  }
}
