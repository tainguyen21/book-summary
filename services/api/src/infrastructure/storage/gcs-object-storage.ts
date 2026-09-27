import { Storage } from "@google-cloud/storage";

import type { ObjectStorage, StoredObjectHead } from "../../domain/books/book";

export interface GcsObjectStorageConfig {
  bucket: string;
  projectId?: string;
}

export class GcsObjectStorage implements ObjectStorage {
  private readonly bucket;

  constructor(config: GcsObjectStorageConfig) {
    const storage = new Storage(
      config.projectId ? { projectId: config.projectId } : undefined,
    );
    this.bucket = storage.bucket(config.bucket);
  }

  async createPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    const [uploadUrl] = await this.bucket.file(input.objectKey).getSignedUrl({
      action: "write",
      contentType: input.contentType,
      expires: expiresAt,
      version: "v4",
    });

    return {
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async head(objectKey: string): Promise<StoredObjectHead | undefined> {
    try {
      const [metadata] = await this.bucket.file(objectKey).getMetadata();
      const sizeBytes = Number(metadata.size);
      if (
        typeof metadata.contentType !== "string" ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0
      ) {
        throw new Error("Storage object metadata is incomplete.");
      }

      return {
        contentType: metadata.contentType,
        sizeBytes,
        etag: metadata.etag,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 404
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
