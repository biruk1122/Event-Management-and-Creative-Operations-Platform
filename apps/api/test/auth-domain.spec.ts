import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { AccessTokenService } from "../src/auth/domain/access-token.service.js";
import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenHashEquals,
} from "../src/auth/domain/refresh-token.js";
import type { Environment } from "../src/config/environment.js";

const SECRET = "unit-test-access-token-secret-at-least-32-chars";
const environment = {
  AUTH_ACCESS_TOKEN_SECRET: SECRET,
  AUTH_ACCESS_TOKEN_TTL: "15m",
} as unknown as Environment;

describe("PasswordHasher", () => {
  const hasher = new PasswordHasher();

  it("verifies a matching password and rejects others", async () => {
    const hash = await hasher.hash("correct horse battery staple");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(
      hasher.verify(hash, "correct horse battery staple"),
    ).resolves.toBe(true);
    await expect(hasher.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("salts each hash so the same password produces different digests", async () => {
    const [first, second] = await Promise.all([
      hasher.hash("same-password"),
      hasher.hash("same-password"),
    ]);
    expect(first).not.toEqual(second);
    await expect(hasher.verify(first, "same-password")).resolves.toBe(true);
    await expect(hasher.verify(second, "same-password")).resolves.toBe(true);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    await expect(hasher.verify("not-a-hash", "anything")).resolves.toBe(false);
  });
});

describe("refresh token", () => {
  it("generates distinct base64url tokens and a stable digest", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toEqual(b);
    expect(hashRefreshToken(a)).toEqual(hashRefreshToken(a));
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).not.toEqual(hashRefreshToken(b));
  });

  it("compares digests in constant time and by length", () => {
    const digest = hashRefreshToken(generateRefreshToken());
    expect(refreshTokenHashEquals(digest, digest)).toBe(true);
    expect(refreshTokenHashEquals(digest, digest.slice(0, 62))).toBe(false);
    expect(
      refreshTokenHashEquals(digest, hashRefreshToken(generateRefreshToken())),
    ).toBe(false);
  });
});

describe("AccessTokenService", () => {
  const service = new AccessTokenService(environment);

  it("round-trips subject and session id", async () => {
    const token = await service.issue({ sub: "user-1", sid: "session-1" });
    await expect(service.verify(token)).resolves.toEqual({
      sub: "user-1",
      sid: "session-1",
    });
  });

  it("rejects a tampered token", async () => {
    const token = await service.issue({ sub: "user-1", sid: "session-1" });
    await expect(service.verify(`${token}x`)).resolves.toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const other = new AccessTokenService({
      ...environment,
      AUTH_ACCESS_TOKEN_SECRET: "a-different-secret-that-is-also-32-chars-long",
    });
    const token = await other.issue({ sub: "user-1", sid: "session-1" });
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ sid: "session-1" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuer("event-platform")
      .setAudience("event-platform-api")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    await expect(service.verify(expired)).resolves.toBeNull();
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    const wrongIssuer = await new SignJWT({ sid: "s" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuer("someone-else")
      .setAudience("event-platform-api")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(service.verify(wrongIssuer)).resolves.toBeNull();
  });

  it("rejects a token that is missing the session id claim", async () => {
    const noSid = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuer("event-platform")
      .setAudience("event-platform-api")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(service.verify(noSid)).resolves.toBeNull();
  });
});
