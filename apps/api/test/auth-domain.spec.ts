import { describe, expect, it } from "vitest";

import { durationToMs } from "../src/auth/auth-cookies.js";
import { AccessTokenService } from "../src/auth/domain/access-token.service.js";
import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenHashEquals,
} from "../src/auth/domain/refresh-token.js";
import type { Environment } from "../src/config/environment.js";

const environment = {
  AUTH_ACCESS_TOKEN_SECRET: "unit-test-access-token-secret-at-least-32-chars",
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

  it("returns false for a malformed hash instead of throwing", async () => {
    await expect(hasher.verify("not-a-hash", "anything")).resolves.toBe(false);
  });
});

describe("refresh token", () => {
  it("generates distinct tokens and a stable digest", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).not.toEqual(b);
    expect(hashRefreshToken(a)).toEqual(hashRefreshToken(a));
    expect(hashRefreshToken(a)).not.toEqual(hashRefreshToken(b));
    expect(
      refreshTokenHashEquals(hashRefreshToken(a), hashRefreshToken(a)),
    ).toBe(true);
    expect(
      refreshTokenHashEquals(hashRefreshToken(a), hashRefreshToken(b)),
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
});

describe("durationToMs", () => {
  it("parses unit suffixes and bare seconds", () => {
    expect(durationToMs("15m")).toBe(900_000);
    expect(durationToMs("30d")).toBe(2_592_000_000);
    expect(durationToMs("900s")).toBe(900_000);
    expect(durationToMs("500ms")).toBe(500);
    expect(durationToMs("45")).toBe(45_000);
  });
});
