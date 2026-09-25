import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived HLS stream tokens.
 *
 * Design: the master manifest is fetched with the user's JWT, but ExoPlayer
 * then requests variant playlists as plain sub-requests (no way to attach the
 * Authorization header per-URL). Each variant URI therefore carries an
 * HMAC-SHA256 token: base64url(userId).base64url(videoId).exp.base64url(sig),
 * 10-minute expiry, bound to one user + one video.
 *
 * This is NOT a replacement for the permission check — serveVariant()
 * re-verifies the token AND re-checks (user active, video published + READY,
 * permission grant) on every single call. A leaked token is useless after
 * 10 minutes and useless for any other video or user.
 */

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function b64urlEncodeBytes(b: Buffer): string {
  return b.toString('base64url');
}

@Injectable()
export class HlsTokenService {
  private readonly secret: Buffer;
  private readonly ttlSec: number;

  constructor(private readonly config: ConfigService) {
    const secret = config.getOrThrow<string>('hlsTokenSecret');
    if (secret.length < 32) {
      throw new Error('HLS_TOKEN_SECRET must be at least 32 characters long');
    }
    this.secret = Buffer.from(secret, 'utf8');
    this.ttlSec = config.getOrThrow<number>('hlsSegmentTtlSec');
  }

  /** Issue a token for (userId, videoId), valid for hlsSegmentTtlSec. */
  issue(userId: string, videoId: string): string {
    const exp = Math.floor(Date.now() / 1000) + this.ttlSec;
    const body = `${b64urlEncode(userId)}.${b64urlEncode(videoId)}.${exp}`;
    const sig = b64urlEncodeBytes(createHmac('sha256', this.secret).update(body).digest());
    return `${body}.${sig}`;
  }

  /**
   * Verify a token presented for expectedVideoId.
   * Returns the bound ids, or null when invalid/expired/mismatched.
   */
  verify(token: string, expectedVideoId: string): { userId: string; videoId: string } | null {
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [u, v, expStr, sig] = parts;
    const body = `${u}.${v}.${expStr}`;
    const expected = b64urlEncodeBytes(createHmac('sha256', this.secret).update(body).digest());
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return null;
    let userId: string;
    let videoId: string;
    try {
      userId = b64urlDecode(u);
      videoId = b64urlDecode(v);
    } catch {
      return null;
    }
    if (!userId || videoId !== expectedVideoId) return null;
    return { userId, videoId };
  }
}
