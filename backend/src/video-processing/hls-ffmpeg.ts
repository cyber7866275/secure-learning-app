/**
 * Pure HLS packaging helpers (no NestJS dependencies) so the ffmpeg command
 * chain can be unit-tested with plain node.
 *
 * What this produces for one source video, inside outDir:
 *   master.m3u8            — variant playlist (3 renditions)
 *   v1080.m3u8 / v720.m3u8 / v480.m3u8 — per-rendition playlists
 *   v1080_seg000.ts ...    — 6-second MPEG-TS segments, AES-128 encrypted
 *   enc.key                — the random 128-bit content key (stored in the
 *                            SAME private bucket; served only via short-lived
 *                            presigned URLs rewritten at request time)
 *   thumb.jpg              — thumbnail frame (best effort)
 *
 * Security notes:
 * - Segments are AES-128 encrypted with a per-video random 128-bit key
 *   (ffmpeg writes the IV in the EXT-X-KEY tag; a standard HLS client was
 *   used to verify encrypted segments decrypt cleanly end-to-end).
 *   This is NOT Widevine DRM — see the Widevine upgrade notes in README.
 * - The EXT-X-KEY URI baked here ("enc.key") is a placeholder: the manifest
 *   service rewrites every URI (segments + key) to short-lived presigned
 *   storage URLs on each authorized request.
 */

import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface Rendition {
  name: string;
  width: number;
  height: number;
  videoKbps: number;
  audioKbps: number;
  /** Declared BANDWIDTH in the master playlist (video+audio+container overhead). */
  bandwidth: number;
}

export const RENDITIONS: Rendition[] = [
  { name: 'v1080', width: 1920, height: 1080, videoKbps: 5000, audioKbps: 128, bandwidth: 5_600_000 },
  { name: 'v720', width: 1280, height: 720, videoKbps: 2500, audioKbps: 128, bandwidth: 2_900_000 },
  { name: 'v480', width: 854, height: 480, videoKbps: 1000, audioKbps: 96, bandwidth: 1_200_000 },
];

export const SEGMENT_SECONDS = 6;
export const KEY_FILE_NAME = 'enc.key';
export const THUMB_FILE_NAME = 'thumb.jpg';

export interface PackagedFile {
  /** Path relative to the HLS output dir, e.g. "v720.m3u8". */
  relativePath: string;
  absolutePath: string;
  contentType: string;
}

export interface HlsPackageResult {
  durationSec: number;
  files: PackagedFile[];
  thumbnailGenerated: boolean;
}

export interface FfmpegPaths {
  ffmpegPath?: string;
  ffprobePath?: string;
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (fileName.endsWith('.ts')) return 'video/mp2t';
  if (fileName.endsWith('.key')) return 'application/octet-stream';
  if (fileName.endsWith('.jpg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/** storageKey "videos/{uuid}/source.mp4" -> "videos/{uuid}/hls" */
export function hlsPrefixForStorageKey(storageKey: string): string {
  const idx = storageKey.lastIndexOf('/');
  if (idx <= 0) throw new Error(`Cannot derive HLS prefix from storage key "${storageKey}"`);
  return `${storageKey.slice(0, idx)}/hls`;
}

async function probeDuration(
  inputPath: string,
  ffprobePath: string,
): Promise<number> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      inputPath,
    ]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0; // thumbnail seek falls back to 1s; packaging continues
  }
}

export async function packageToHls(
  inputPath: string,
  outDir: string,
  paths: FfmpegPaths = {},
): Promise<HlsPackageResult> {
  const ffmpeg = paths.ffmpegPath || 'ffmpeg';
  const ffprobe = paths.ffprobePath || 'ffprobe';

  await fs.mkdir(outDir, { recursive: true });

  const durationSec = await probeDuration(inputPath, ffprobe);

  // One random 128-bit key per video. Written next to the segments in the
  // PRIVATE bucket; clients only ever see it through presigned URLs.
  const keyHex = randomBytes(16).toString('hex');
  await fs.writeFile(path.join(outDir, KEY_FILE_NAME), Buffer.from(keyHex, 'hex'));
  // keyinfo format: <key URI baked into playlist> / <local key file> [/ IV].
  // No IV line -> ffmpeg generates a random IV per segment (best practice).
  await fs.writeFile(
    path.join(outDir, 'keyinfo.txt'),
    `${KEY_FILE_NAME}\n${path.join(outDir, KEY_FILE_NAME)}\n`,
  );

  const files: PackagedFile[] = [];
  const push = (relativePath: string) =>
    files.push({
      relativePath,
      absolutePath: path.join(outDir, relativePath),
      contentType: contentTypeFor(relativePath),
    });

  for (const r of RENDITIONS) {
    const playlist = `${r.name}.m3u8`;
    const maxrate = Math.round(r.videoKbps * 1.07);
    const bufsize = Math.round(r.videoKbps * 1.5);
    try {
      await execFileAsync(
        ffmpeg,
        [
          '-y',
          '-i',
          inputPath,
          '-vf',
          // Scale down to fit the rendition box, then round both dimensions to
          // even numbers — libx264 requires divisible-by-2 (e.g. 854x480 from
          // a 16:9 source can land on 853x480, which would fail the encode).
          `scale=${r.width}:${r.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-profile:v',
          'high',
          '-b:v',
          `${r.videoKbps}k`,
          '-maxrate',
          `${maxrate}k`,
          '-bufsize',
          `${bufsize}k`,
          '-c:a',
          'aac',
          '-b:a',
          `${r.audioKbps}k`,
          '-ac',
          '2',
          '-hls_time',
          String(SEGMENT_SECONDS),
          '-hls_playlist_type',
          'vod',
          '-hls_segment_filename',
          `${r.name}_seg%03d.ts`,
          '-hls_key_info_file',
          'keyinfo.txt',
          playlist,
        ],
        { cwd: outDir, maxBuffer: 16 * 1024 * 1024 },
      );
    } catch (err) {
      throw new Error(
        `ffmpeg failed for rendition ${r.name}: ${(err as Error).message}`,
      );
    }
    push(playlist);
    // Collect the segments ffmpeg just wrote.
    const entries = await fs.readdir(outDir);
    for (const e of entries.filter((n) => n.startsWith(`${r.name}_seg`) && n.endsWith('.ts'))) {
      if (!files.some((f) => f.relativePath === e)) push(e);
    }
  }

  // Master playlist (written manually — deterministic and simple).
  const master = [
    '#EXTM3U',
    ...RENDITIONS.flatMap((r) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}`,
      `${r.name}.m3u8`,
    ]),
    '',
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'master.m3u8'), master);
  push('master.m3u8');
  push(KEY_FILE_NAME);

  // Thumbnail (best effort — never fails the package).
  let thumbnailGenerated = false;
  try {
    const seek = durationSec > 0 ? Math.min(5, durationSec * 0.4) : 1;
    await execFileAsync(
      ffmpeg,
      [
        '-y',
        '-ss',
        seek.toFixed(1),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-q:v',
        '4',
        THUMB_FILE_NAME,
      ],
      // NOTE: cwd must be outDir — without it the thumbnail lands in the
      // process working directory and the upload loop can't find it.
      { cwd: outDir },
    );
    thumbnailGenerated = true;
    push(THUMB_FILE_NAME);
  } catch {
    thumbnailGenerated = false;
  }

  return { durationSec, files, thumbnailGenerated };
}

/** Convenience for tests: create an isolated temp dir. */
export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
