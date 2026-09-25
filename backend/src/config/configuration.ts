/**
 * Environment validation for @nestjs/config.
 * Fails fast at boot with a clear message instead of dying mysteriously later.
 * No secrets are ever logged here.
 */

export interface AppConfig {
  port: number;
  redisUrl: string;
  jwtAccessSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlDays: number;
  otpTtlSec: number;
  otpMaxAttempts: number;
  otpCooldownSec: number;
  defaultMaxDevices: number;
  deviceOverflow: 'revoke-oldest' | 'deny';
  corsOrigin: string;
  // ---- Object storage (S3-compatible: AWS S3 / Cloudflare R2 / MinIO) ----
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storageForcePathStyle: boolean;
  // ---- Signed URL lifetimes (seconds) ----
  pdfAccessTtlSec: number;
  videoAccessTtlSec: number;
  uploadTtlSec: number;
  // ---- Video processing / HLS (Stage 5) ----
  hlsTokenSecret: string;
  hlsSegmentTtlSec: number;
  ffmpegPath: string;
  ffprobePath: string;
  /** Public base URL of this API, used to build absolute manifest URLs. */
  apiPublicUrl: string;
  videoWorkerEnabled: boolean;
  videoWorkerIntervalMs: number;
  // ---- Play Integrity (Stage 7) ----
  playIntegrityEnabled: boolean;
  androidPackageName: string;
}

function requiredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function positiveInt(name: string, value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid env var ${name}: expected a positive integer, got "${value}"`);
  }
  return n;
}

function optionalBool(name: string, value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new Error(`Invalid env var ${name}: expected true/false, got "${value}"`);
}

export function validateEnv(config: Record<string, unknown>): AppConfig {
  // DATABASE_URL is consumed directly by Prisma; require it early for a clear error.
  requiredString('DATABASE_URL', config.DATABASE_URL);

  const jwtAccessSecret = requiredString('JWT_ACCESS_SECRET', config.JWT_ACCESS_SECRET);
  if (jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long');
  }

  const deviceOverflow = (config.DEVICE_OVERFLOW_BEHAVIOR as string) || 'revoke-oldest';
  if (deviceOverflow !== 'revoke-oldest' && deviceOverflow !== 'deny') {
    throw new Error(
      'Invalid env var DEVICE_OVERFLOW_BEHAVIOR: expected "revoke-oldest" or "deny"',
    );
  }

  return {
    port: positiveInt('PORT', config.PORT, 3000),
    redisUrl: requiredString('REDIS_URL', config.REDIS_URL),
    jwtAccessSecret,
    accessTokenTtlSec: positiveInt('ACCESS_TOKEN_TTL_SEC', config.ACCESS_TOKEN_TTL_SEC, 900),
    refreshTokenTtlDays: positiveInt(
      'REFRESH_TOKEN_TTL_DAYS',
      config.REFRESH_TOKEN_TTL_DAYS,
      30,
    ),
    otpTtlSec: positiveInt('OTP_TTL_SEC', config.OTP_TTL_SEC, 300),
    otpMaxAttempts: positiveInt('OTP_MAX_ATTEMPTS', config.OTP_MAX_ATTEMPTS, 5),
    otpCooldownSec: positiveInt(
      'OTP_RESEND_COOLDOWN_SEC',
      config.OTP_RESEND_COOLDOWN_SEC,
      60,
    ),
    defaultMaxDevices: positiveInt('DEFAULT_MAX_DEVICES', config.DEFAULT_MAX_DEVICES, 1),
    deviceOverflow,
    corsOrigin: (config.CORS_ORIGIN as string) || '*',
    // Storage is core to Stage 2+: fail fast if not configured.
    storageEndpoint: requiredString('STORAGE_ENDPOINT', config.STORAGE_ENDPOINT),
    storageRegion: (config.STORAGE_REGION as string) || 'auto',
    storageBucket: requiredString('STORAGE_BUCKET', config.STORAGE_BUCKET),
    storageAccessKey: requiredString('STORAGE_ACCESS_KEY', config.STORAGE_ACCESS_KEY),
    storageSecretKey: requiredString('STORAGE_SECRET_KEY', config.STORAGE_SECRET_KEY),
    storageForcePathStyle: optionalBool(
      'STORAGE_FORCE_PATH_STYLE',
      config.STORAGE_FORCE_PATH_STYLE,
      false,
    ),
    pdfAccessTtlSec: positiveInt('PDF_ACCESS_TTL_SEC', config.PDF_ACCESS_TTL_SEC, 300),
    videoAccessTtlSec: positiveInt('VIDEO_ACCESS_TTL_SEC', config.VIDEO_ACCESS_TTL_SEC, 600),
    uploadTtlSec: positiveInt('UPLOAD_TTL_SEC', config.UPLOAD_TTL_SEC, 900),
    // ---- Video processing / HLS (Stage 5) ----
    hlsTokenSecret: (() => {
      const s = requiredString('HLS_TOKEN_SECRET', config.HLS_TOKEN_SECRET);
      if (s.length < 32) {
        throw new Error('HLS_TOKEN_SECRET must be at least 32 characters long');
      }
      return s;
    })(),
    hlsSegmentTtlSec: positiveInt('HLS_SEGMENT_TTL_SEC', config.HLS_SEGMENT_TTL_SEC, 600),
    ffmpegPath: (config.FFMPEG_PATH as string) || 'ffmpeg',
    ffprobePath: (config.FFPROBE_PATH as string) || 'ffprobe',
    apiPublicUrl: requiredString('API_PUBLIC_URL', config.API_PUBLIC_URL),
    videoWorkerEnabled: optionalBool(
      'VIDEO_WORKER_ENABLED',
      config.VIDEO_WORKER_ENABLED,
      true,
    ),
    videoWorkerIntervalMs: positiveInt(
      'VIDEO_WORKER_INTERVAL_MS',
      config.VIDEO_WORKER_INTERVAL_MS,
      30_000,
    ),
    // ---- Play Integrity (Stage 7) ----
    // Verification is OFF by default: tokens only decode for Play-distributed
    // apps, so dev/emulator builds would fail. Enable in production after
    // linking the Play Console project + service account. When enabled but
    // misconfigured, the service fails OPEN and logs loudly (never silently
    // locks users out).
    playIntegrityEnabled: optionalBool(
      'PLAY_INTEGRITY_ENABLED',
      config.PLAY_INTEGRITY_ENABLED,
      false,
    ),
    androidPackageName:
      (config.ANDROID_PACKAGE_NAME as string) || 'com.securelearn.app',
  };
}
