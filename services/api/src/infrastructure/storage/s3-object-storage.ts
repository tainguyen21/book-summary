import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ObjectStorage, StoredObjectHead } from "../../domain/books/book";

export interface S3ObjectStorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: Boolean(config.endpoint),
    });
  }

  async createPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; expiresAt: string }> {
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );

    return {
      uploadUrl,
      expiresAt: new Date(
        Date.now() + input.expiresInSeconds * 1000,
      ).toISOString(),
    };
  }

  async head(objectKey: string): Promise<StoredObjectHead | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
        }),
      );

      if (
        typeof result.ContentType !== "string" ||
        typeof result.ContentLength !== "number"
      ) {
        throw new Error("Storage object metadata is incomplete.");
      }

      return {
        contentType: result.ContentType,
        sizeBytes: result.ContentLength,
        etag: result.ETag,
      };
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
