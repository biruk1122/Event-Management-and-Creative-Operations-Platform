import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../../config/environment.js";
import type {
  DownloadGrant,
  ObjectStorage,
  StoredObject,
  UploadGrant,
} from "./object-storage.js";

const UPLOAD_GRANT_SECONDS = 10 * 60;
const DOWNLOAD_GRANT_SECONDS = 5 * 60;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function contentDisposition(filename: string): string {
  const fallback = filename.replaceAll(/[^A-Za-z0-9._-]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Private S3/MinIO implementation. Buckets and credentials never cross this boundary. */
@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: environment.FILE_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.FILE_STORAGE_SECRET_KEY,
      },
      endpoint: environment.FILE_STORAGE_ENDPOINT,
      forcePathStyle: environment.FILE_STORAGE_FORCE_PATH_STYLE,
      region: environment.FILE_STORAGE_REGION,
    });
  }

  async createUploadGrant(input: {
    key: string;
    mediaType: string;
    sizeBytes: number;
  }): Promise<UploadGrant> {
    const grant = await createPresignedPost(this.client, {
      Bucket: this.environment.FILE_STORAGE_BUCKET,
      Conditions: [
        ["eq", "$Content-Type", input.mediaType],
        ["content-length-range", input.sizeBytes, input.sizeBytes],
      ],
      Expires: UPLOAD_GRANT_SECONDS,
      Fields: { "Content-Type": input.mediaType },
      Key: input.key,
    });
    return { fields: grant.fields, url: grant.url };
  }

  async readObject(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.environment.FILE_STORAGE_BUCKET,
          Key: key,
        }),
      );
      const sizeBytes = head.ContentLength;
      if (!sizeBytes || sizeBytes > MAX_FILE_BYTES) {
        return null;
      }
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.environment.FILE_STORAGE_BUCKET,
          Key: key,
        }),
      );
      if (!object.Body) {
        return null;
      }
      const bytes = await object.Body.transformToByteArray();
      if (bytes.byteLength !== sizeBytes || bytes.byteLength > MAX_FILE_BYTES) {
        return null;
      }
      return {
        bytes,
        mediaType: object.ContentType,
        sizeBytes: bytes.byteLength,
      };
    } catch (error) {
      const storageError = error as {
        $metadata?: { httpStatusCode?: number };
        name?: string;
      };
      if (
        storageError.name === "NotFound" ||
        storageError.name === "NoSuchKey" ||
        storageError.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async createDownloadGrant(input: {
    key: string;
    filename: string;
    mediaType: string;
  }): Promise<DownloadGrant> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.environment.FILE_STORAGE_BUCKET,
        Key: input.key,
        ResponseContentDisposition: contentDisposition(input.filename),
        ResponseContentType: input.mediaType,
      }),
      { expiresIn: DOWNLOAD_GRANT_SECONDS },
    );
    return {
      url,
      expiresAt: new Date(Date.now() + DOWNLOAD_GRANT_SECONDS * 1000),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.environment.FILE_STORAGE_BUCKET,
        Key: key,
      }),
    );
  }
}
