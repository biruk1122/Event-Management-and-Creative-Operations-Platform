import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque kiosk bearer secret - the exact shape of `auth/domain/refresh-token.ts`,
 * generalized: a high-entropy random value needs only a fast, deterministic
 * digest (not a slow password KDF), since there is no small human-chosen
 * keyspace to protect against offline brute force. The raw value is shown
 * to an administrator exactly once, at registration; only its SHA-256
 * digest is ever stored.
 */

const TOKEN_BYTES = 32;

export function generateKioskToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashKioskToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
export function kioskTokenHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
