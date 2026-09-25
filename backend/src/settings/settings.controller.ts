import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsObject } from 'class-validator';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../common/decorators/public.decorator';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsObject()
  settings!: Record<string, string>;
}

@UseGuards(AdminGuard)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll().then((settings) => ({ settings }));
  }

  @Put()
  async update(@Body() dto: UpdateSettingsDto) {
    try {
      const settings = await this.settings.updateMany(dto.settings ?? {});
      return { settings };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid settings',
      );
    }
  }
}

/**
 * Public feature flags for the mobile app (Stage 4). Only non-sensitive
 * keys are exposed — no secrets, no device limits, no internal config.
 * The app defaults to the most secure posture if this fetch fails.
 */
@Public()
@Controller('settings')
export class PublicSettingsController {
  private static readonly PUBLIC_KEYS = [
    'screenshot_protection',
    'recording_protection',
    'watermark_enabled',
    // Non-sensitive enforcement flags the app needs before login.
    'root_block_enabled',
    'integrity_enforcement',
  ] as const;

  constructor(private readonly settings: SettingsService) {}

  @Get()
  async getPublic() {
    const all = await this.settings.getAll();
    const settings: Record<string, string> = {};
    for (const key of PublicSettingsController.PUBLIC_KEYS) {
      settings[key] = all[key] ?? SettingsService.DEFAULTS[key];
    }
    return { settings };
  }
}
