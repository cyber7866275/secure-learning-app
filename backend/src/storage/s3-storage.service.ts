import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

/**
 * S3-compatible storage (AWS S3, Cloudflare R2, MinIO).
 * The bucket must have NO public access: every URL here is presigned.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.bucket = config.getOrThrow<string>('storageBucket');
    this.client = new S3Client({
      region: config.getOrThrow<string>('storageRegion'),
      endpoint: config.getOrThrow<string>('storageEndpoint'),
      forcePathStyle: config.getOrThrow<boolean>('storageForcePathStyle'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('storageAccessKey'),
        secretAccessKey: config.getOrThrow<string>('storageSecretKey'),
      },
    });
  }

  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSec: number,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: expiresInSec },
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to create upload URL: ${(err as Error).message}`,
      );
    }
  }

  async getPresignedGetUrl(key: string, expiresInSec: number): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSec },
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to create access URL: ${(err as Error).message}`,
      );
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Best-effort: a stale object is a storage leak, not a security hole
      // (the DB row is already gone, so no signed URL will ever be issued).
      console.warn(`[storage] deleteObject failed for key (not logged): ${(err as Error).message}`);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getObjectBytes(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to read object: ${(err as Error).message}`,
      );
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to write object: ${(err as Error).message}`,
      );
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    try {
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const o of res.Contents ?? []) {
          if (o.Key) keys.push(o.Key);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return keys;
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to list objects: ${(err as Error).message}`,
      );
    }
  }

  async deleteObjects(keys: string[]): Promise<void> {
    // S3 DeleteObjects caps at 1000 keys per call.
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })) },
          }),
        );
      } catch (err) {
        // Best-effort: stale objects are a storage leak, not a security hole.
        console.warn(`[storage] deleteObjects failed: ${(err as Error).message}`);
      }
    }
  }
}
