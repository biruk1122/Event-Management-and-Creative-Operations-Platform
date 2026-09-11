export const FILE_OBJECT_STORAGE = Symbol("FILE_OBJECT_STORAGE");

export interface UploadGrant {
  url: string;
  fields: Record<string, string>;
}

export interface DownloadGrant {
  url: string;
  expiresAt: Date;
}

export interface StoredObject {
  bytes: Uint8Array;
  mediaType: string | undefined;
  sizeBytes: number;
}

/**
 * The only storage boundary used by the domain. It deliberately speaks in
 * opaque keys and short-lived grants, never bucket/provider details.
 */
export interface ObjectStorage {
  createUploadGrant(input: {
    key: string;
    mediaType: string;
    sizeBytes: number;
  }): Promise<UploadGrant>;
  readObject(key: string): Promise<StoredObject | null>;
  createDownloadGrant(input: {
    key: string;
    filename: string;
    mediaType: string;
  }): Promise<DownloadGrant>;
  deleteObject(key: string): Promise<void>;
}
