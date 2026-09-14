import { GetObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../config/environment.js";

const signing = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: signing.createPresignedPost,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: signing.getSignedUrl,
}));

import { S3ObjectStorage } from "./s3-object-storage.js";

const environment: Environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 4000,
  API_RATE_LIMIT_MAX: 100,
  API_RATE_LIMIT_TTL_MS: 60_000,
  AUTH_ACCESS_TOKEN_SECRET: "access-token-secret-at-least-32-characters",
  AUTH_ACCESS_TOKEN_TTL: "15m",
  AUTH_COOKIE_SAME_SITE: "lax",
  AUTH_COOKIE_SECURE: false,
  AUTH_LOGIN_RATE_LIMIT_MAX: 20,
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: 300_000,
  AUTH_LOCKOUT_DURATION_MS: 900_000,
  AUTH_MAX_FAILED_ATTEMPTS: 10,
  AUTH_REFRESH_TOKEN_SECRET: "refresh-token-secret-at-least-32-characters",
  AUTH_REFRESH_TOKEN_TTL: "30d",
  CORS_ORIGINS: "http://localhost:3000",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  FILE_SCANNER_MODE: "test",
  FILE_STORAGE_ACCESS_KEY: "test-access-key",
  FILE_STORAGE_BUCKET: "event-platform-files",
  FILE_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  FILE_STORAGE_FORCE_PATH_STYLE: true,
  FILE_STORAGE_REGION: "us-east-1",
  FILE_STORAGE_SECRET_KEY: "test-secret-key",
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  REALTIME_COMMAND_RATE_LIMIT_MAX: 30,
  REALTIME_COMMAND_RATE_LIMIT_WINDOW_MS: 10_000,
};

describe("S3ObjectStorage signing policies", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("creates a one-key, exact-type and exact-size upload policy that expires in ten minutes", async () => {
    signing.createPresignedPost.mockResolvedValue({
      fields: { key: "files/opaque-key" },
      url: "https://storage.test/upload",
    });
    const storage = new S3ObjectStorage(environment);

    await expect(
      storage.createUploadGrant({
        key: "files/opaque-key",
        mediaType: "application/pdf",
        sizeBytes: 29,
      }),
    ).resolves.toEqual({
      fields: { key: "files/opaque-key" },
      url: "https://storage.test/upload",
    });
    expect(signing.createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      {
        Bucket: "event-platform-files",
        Conditions: [
          ["eq", "$Content-Type", "application/pdf"],
          ["content-length-range", 29, 29],
        ],
        Expires: 10 * 60,
        Fields: { "Content-Type": "application/pdf" },
        Key: "files/opaque-key",
      },
    );
  });

  it("creates a five-minute private download grant with verified response type and attachment disposition", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    let signedCommand: unknown;
    signing.getSignedUrl.mockImplementation(
      (_client: unknown, command: unknown) => {
        signedCommand = command;
        return Promise.resolve("https://storage.test/download");
      },
    );
    const storage = new S3ObjectStorage(environment);

    await expect(
      storage.createDownloadGrant({
        filename: "call sheet.pdf",
        key: "files/opaque-key",
        mediaType: "application/pdf",
      }),
    ).resolves.toEqual({
      expiresAt: new Date("2030-01-01T00:05:00.000Z"),
      url: "https://storage.test/download",
    });
    expect(signedCommand).toBeInstanceOf(GetObjectCommand);
    if (!(signedCommand instanceof GetObjectCommand)) {
      throw new Error("test signing call omitted its GetObjectCommand");
    }
    expect(signedCommand.input).toEqual({
      Bucket: "event-platform-files",
      Key: "files/opaque-key",
      ResponseContentDisposition:
        "attachment; filename=\"call_sheet.pdf\"; filename*=UTF-8''call%20sheet.pdf",
      ResponseContentType: "application/pdf",
    });
    expect(signing.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      signedCommand,
      { expiresIn: 5 * 60 },
    );
  });
});
