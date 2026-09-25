/**
 * Pure HLS playlist rewriting (no NestJS dependencies — unit-testable).
 *
 * The stored playlists reference bare file names ("v720_seg000.ts", "enc.key").
 * On every authorized request the server rewrites them:
 *   - master.m3u8: variant URIs -> absolute URLs of the /videos/:id/manifest
 *     endpoint with a short-lived HMAC token (?variant=..&token=..)
 *   - variant playlists: segment URIs and the EXT-X-KEY URI -> short-lived
 *     presigned storage URLs (10 min). The AES-128 key itself therefore never
 *     has a stable public address.
 */

/** Rewrite variant URIs in a master playlist to per-request authorized URLs. */
export function rewriteMasterPlaylist(
  masterRaw: string,
  variantUrlFor: (variant: string) => string,
): string {
  return masterRaw
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        // Stored as "v720.m3u8" (or a path ending in it) — variant name is
        // the file stem; validated again when the variant is served.
        const file = t.split('/').pop() ?? t;
        const variant = file.replace(/\.m3u8$/i, '');
        return variantUrlFor(variant);
      }
      return line;
    })
    .join('\n');
}

/**
 * Rewrite a variant playlist: every segment URI and the EXT-X-KEY URI become
 * presigned URLs. `presign` maps a stored file name to its signed URL.
 */
export async function rewriteVariantPlaylist(
  variantRaw: string,
  presign: (fileName: string) => Promise<string>,
): Promise<string> {
  const out: string[] = [];
  for (const line of variantRaw.split('\n')) {
    const keyUri = line.match(/URI="([^"]+)"/);
    if (line.startsWith('#EXT-X-KEY') && keyUri) {
      const signed = await presign(keyUri[1]);
      // The signed URL may itself contain characters like & or =; the URI
      // attribute is quoted so this stays a valid playlist line.
      out.push(line.replace(`URI="${keyUri[1]}"`, `URI="${signed}"`));
      continue;
    }
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      out.push(await presign(t));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
