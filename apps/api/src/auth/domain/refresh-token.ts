import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque refresh token. The raw value is delivered only in the `refresh_token`
 * cookie; the database stores its SHA-256 digest so a database read cannot
 * recover a usable token.
 */

const TOKEN_BYTES = 32;

export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
export function refreshTokenHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
