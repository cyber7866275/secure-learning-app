import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface IntegrityVerdict {
  /** True when the device/app passed every check we require. */
  ok: boolean;
  /** Machine-readable failure reasons (empty when ok). */
  reasons: string[];
}

/**
 * Play Integrity verification (Stage 7).
 *
 * The Android app requests an integrity token on login and sends it with the
 * auth request. This service decodes the token via Google's Play Integrity
 * API and checks:
 *   1. the token was minted for OUR package name,
 *   2. the app is Play-recognized (not repackaged/tampered),
 *   3. the device meets device integrity (not rooted/emulator-farmed —
 *      the hardware-backed counterpart to the app's RootBeer self-report).
 *
 * IMPORTANT honest notes:
 * - Verification only works for apps distributed through Google Play
 *   (the Play Console project must be linked). Debug/emulator builds will
 *   NOT produce verifiable tokens — that's why this is fail-open unless
 *   the admin explicitly enables enforcement.
 * - `PLAY_INTEGRITY_ENABLED=false` (the default) skips everything.
 * - If enabled but no service-account credentials are found, we fail OPEN
 *   and log a loud warning on every verification attempt — a misconfigured
 *   "block" mode must never silently lock every user out.
 */
@Injectable()
export class IntegrityService implements OnModuleInit {
  private readonly logger = new Logger(IntegrityService.name);
  private warnedNoCredentials = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.get<boolean>('playIntegrityEnabled')) {
      this.logger.warn(
        'Play Integrity verification is ENABLED. ' +
          'Make sure GOOGLE_APPLICATION_CREDENTIALS points at a service ' +
          'account with the Play Integrity API enabled, and that the app ' +
          'is distributed via Google Play. Without credentials this fails OPEN.',
      );
    }
  }

  get enabled(): boolean {
    return this.config.get<boolean>('playIntegrityEnabled') ?? false;
  }

  async verify(token: string): Promise<IntegrityVerdict> {
    const packageName = this.config.get<string>('androidPackageName') ?? 'com.securelearn.app';

    let client: ReturnType<typeof google.playintegrity>;
    try {
      // Picks up GOOGLE_APPLICATION_CREDENTIALS automatically.
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/playintegrity'],
      });
      // Fail fast with a clear signal when credentials are absent.
      await auth.getClient().catch(() => {
        throw new Error('no-credentials');
      });
      client = google.playintegrity({ version: 'v1', auth });
    } catch (err) {
      if (!this.warnedNoCredentials) {
        this.warnedNoCredentials = true;
        this.logger.error(
          'Play Integrity is enabled but no Google credentials were found ' +
            '(set GOOGLE_APPLICATION_CREDENTIALS). Failing OPEN — fix this ' +
            'before relying on "block" enforcement.',
        );
      }
      void err;
      return { ok: true, reasons: ['credentials-missing-fail-open'] };
    }

    try {
      const res = await client.v1.decodeIntegrityToken({
        packageName,
        requestBody: { integrityToken: token },
      });
      const payload = res.data.tokenPayloadExternal;
      const reasons: string[] = [];

      if (payload?.requestDetails?.requestPackageName !== packageName) {
        reasons.push('package-name-mismatch');
      }
      if (payload?.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
        reasons.push(
          `app-verdict:${payload?.appIntegrity?.appRecognitionVerdict ?? 'unknown'}`,
        );
      }
      const deviceVerdicts =
        payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
      if (!deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
        reasons.push(`device-verdict:${deviceVerdicts.join(',') || 'none'}`);
      }
      return { ok: reasons.length === 0, reasons };
    } catch (err) {
      // Network/API errors fail open too — an outage at Google must not
      // brick logins. The failure is logged for the admin to notice.
      this.logger.warn(
        `Play Integrity decode call failed (fail-open): ${(err as Error).message}`,
      );
      return { ok: true, reasons: ['decode-error-fail-open'] };
    }
  }
}
