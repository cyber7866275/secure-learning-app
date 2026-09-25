/**
 * Object-storage abstraction. Implementations must keep the bucket private;
 * every read/write goes through short-lived presigned URLs issued here.
 * No storage keys or URLs are ever logged.
 */
export abstract class StorageService {
  /**
   * Presigned URL the admin client uses to upload a file directly to the
   * private bucket (PUT). The key is chosen by the server, never the client.
   */
  abstract getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSec: number,
  ): Promise<string>;

  /**
   * Presigned URL for a single authorized read. Issued only after the
   * server-side permission check passes; lifetimes are deliberately short
   * (PDFs ~5 min, videos ~10 min).
   */
  abstract getPresignedGetUrl(key: string, expiresInSec: number): Promise<string>;

  /** Delete an object (content delete / replace flows). Best-effort. */
  abstract deleteObject(key: string): Promise<void>;

  /** True when the object exists (used before publish / replace-confirm). */
  abstract objectExists(key: string): Promise<boolean>;

  /**
   * Raw bytes of an object. Used by the video-packaging worker to fetch the
   * source file for transcoding. Never exposed to clients.
   */
  abstract getObjectBytes(key: string): Promise<Buffer>;

  /** Write raw bytes (packaging worker uploads HLS segments/playlists). */
  abstract putObject(key: string, body: Buffer, contentType: string): Promise<void>;

  /** All keys under a prefix (used to clean up a video's HLS directory). */
  abstract listKeys(prefix: string): Promise<string[]>;

  /** Bulk delete (HLS cleanup on video delete). Best-effort. */
  abstract deleteObjects(keys: string[]): Promise<void>;
}
