import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleMeetConfig,
  MeetTokenCipher,
  CALENDAR_SCOPE,
} from "../src/meetings/google-meet/google-meet.config.js";
import {
  GoogleCalendarAdapter,
  conferenceLink,
} from "../src/meetings/google-meet/google-calendar.adapter.js";
import { MeetError } from "../src/meetings/google-meet/google-meet.errors.js";
import { validateEnvironment } from "../src/config/environment.js";
import type { GoogleMeetRepository } from "../src/meetings/google-meet/google-meet.repository.js";

const keys = {
  previous: randomBytes(32).toString("base64"),
  current: randomBytes(32).toString("base64"),
};
function config(overrides = {}) {
  return new GoogleMeetConfig(
    validateEnvironment({
      DATABASE_URL: "postgresql://test:test@localhost/test",
      AUTH_ACCESS_TOKEN_SECRET: "test-access-secret-longer-than-32-characters",
      AUTH_REFRESH_TOKEN_SECRET:
        "test-refresh-secret-longer-than-32-characters",
      GOOGLE_MEET_ENABLED: "true",
      GOOGLE_MEET_OPERATOR: "Test operator",
      GOOGLE_MEET_ACTIVATION_REVIEW: "test-fixture-only",
      GOOGLE_MEET_CLIENT_ID: "test-client",
      GOOGLE_MEET_CLIENT_SECRET: "test-client-secret",
      GOOGLE_MEET_CALLBACK_URL:
        "http://localhost:4000/api/v1/meetings/google-calendar/callback",
      GOOGLE_MEET_RETURN_URL: "http://localhost:3000/meetings",
      GOOGLE_MEET_KEY_ID: "current",
      GOOGLE_MEET_KEYS: JSON.stringify(keys),
      ...overrides,
    }),
  );
}
function adapter(settings = config()) {
  const repository = {
    active: vi.fn().mockResolvedValue(true),
    reserve: vi.fn().mockResolvedValue(undefined),
  };
  const google = new GoogleCalendarAdapter(
    settings,
    repository as unknown as GoogleMeetRepository,
  );
  const http = vi.fn();
  vi.stubGlobal("fetch", http);
  return { google, http, repository };
}
afterEach(() => vi.unstubAllGlobals());

describe("Google Meet token encryption and activation", () => {
  it("binds authenticated ciphertext to its owner/purpose and rejects tampering", () => {
    const cipher = new MeetTokenCipher("current", JSON.stringify(keys));
    const value = cipher.seal("private-refresh-token", "refresh:alice");
    expect(value).not.toContain("private-refresh-token");
    expect(cipher.open(value, "refresh:alice")).toBe("private-refresh-token");
    expect(() => cipher.open(value, "refresh:bob")).toThrow();
    expect(() => cipher.open(value, "consent:alice")).toThrow();
    const parts = value.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => cipher.open(parts.join("."), "refresh:alice")).toThrow();
  });
  it("supports read-old/write-new rotation and rollback while retaining both keys", () => {
    const old = new MeetTokenCipher("previous", JSON.stringify(keys));
    const current = new MeetTokenCipher("current", JSON.stringify(keys));
    const rotated = current.seal(
      current.open(old.seal("refresh", "alice"), "alice"),
      "alice",
    );
    expect(rotated.startsWith("current.")).toBe(true);
    expect(old.open(rotated, "alice")).toBe("refresh");
    expect(
      () =>
        new MeetTokenCipher("current", JSON.stringify({ current: "short" })),
    ).toThrow();
  });
  it("defaults off without vendor secrets and refuses incomplete activation", () => {
    expect(
      config({ GOOGLE_MEET_ENABLED: "false", GOOGLE_MEET_KEYS: "" }).cipher,
    ).toBeNull();
    expect(() => config({ GOOGLE_MEET_OPERATOR: "" })).toThrow();
    expect(() => config({ GOOGLE_MEET_ACTIVATION_REVIEW: "" })).toThrow();
    expect(() => config({ NODE_ENV: "production" })).toThrow();
  });
});
describe("Google Calendar adapter", () => {
  it("requests exact owned-calendar and identity scopes, offline consent and PKCE", () => {
    const { google } = adapter();
    const url = new URL(
      google.authorizationUrl("one-time-state", "pkce-challenge"),
    );
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      CALENDAR_SCOPE,
    ]);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("verifies provider identity and refuses missing/partial calendar consent", async () => {
    const { google, http } = adapter();
    http.mockResolvedValueOnce(
      Response.json({
        access_token: "access",
        token_type: "Bearer",
        refresh_token: "refresh",
        scope: CALENDAR_SCOPE,
      }),
    );
    http.mockResolvedValueOnce(
      Response.json({ sub: "verified-provider-subject", email_verified: true }),
    );
    await expect(google.exchange("alice", "code", "verifier")).resolves.toEqual(
      { refreshToken: "refresh", subject: "verified-provider-subject" },
    );
    http.mockResolvedValueOnce(
      Response.json({
        access_token: "access",
        token_type: "Bearer",
        refresh_token: "refresh",
        scope: "email",
      }),
    );
    await expect(
      google.exchange("alice", "code", "verifier"),
    ).rejects.toMatchObject({ reason: "PROVIDER_DENIED" });
  });
  it("rejects unverified identity without exposing the provider body", async () => {
    const { google, http } = adapter();
    http.mockResolvedValueOnce(
      Response.json({
        access_token: "access",
        token_type: "Bearer",
        refresh_token: "refresh",
        scope: CALENDAR_SCOPE,
      }),
    );
    http.mockResolvedValueOnce(
      Response.json({
        sub: "subject",
        email_verified: false,
        email: "sensitive",
      }),
    );
    await expect(
      google.exchange("alice", "code", "verifier"),
    ).rejects.toMatchObject({ reason: "PROVIDER_DENIED" });
  });
  it("counts every attempt and distinguishes quota, permission, invalid tokens and outages", async () => {
    const { google, http, repository } = adapter();
    for (const [status, body, reason] of [
      [429, {}, "QUOTA"],
      [403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }, "QUOTA"],
      [403, {}, "PROVIDER_DENIED"],
      [401, {}, "RECONNECT_REQUIRED"],
      [503, {}, "PROVIDER_UNAVAILABLE"],
    ] as const) {
      http.mockResolvedValueOnce(Response.json(body, { status }));
      await expect(
        google.event("alice", "secret", "mapped", "GET"),
      ).rejects.toMatchObject({ reason });
    }
    expect(repository.reserve).toHaveBeenCalledTimes(5);
    http.mockRejectedValueOnce(new Error("private network details"));
    await expect(
      google.event("alice", "secret", "mapped", "GET"),
    ).rejects.toBeInstanceOf(MeetError);
  });
  it("never calls Google when disabled, inactive or capped", async () => {
    const { google, repository, http } = adapter(
      config({ GOOGLE_MEET_ENABLED: "false" }),
    );
    await expect(google.refresh("alice", "token")).rejects.toMatchObject({
      reason: "DISABLED",
    });
    expect(http).not.toHaveBeenCalled();
    const active = adapter();
    active.repository.active.mockResolvedValue(false);
    await expect(active.google.refresh("alice", "token")).rejects.toMatchObject(
      { reason: "RECONNECT_REQUIRED" },
    );
    active.repository.active.mockResolvedValue(true);
    active.repository.reserve.mockRejectedValue(new MeetError("QUOTA"));
    await expect(active.google.refresh("alice", "token")).rejects.toMatchObject(
      { reason: "QUOTA" },
    );
    expect(active.http).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });
  it("handles duplicate, already-deleted export and successful empty revocation", async () => {
    const { google, http } = adapter();
    http.mockResolvedValueOnce(Response.json({}, { status: 409 }));
    await expect(
      google.event("alice", "token", "mapped", "POST", {}),
    ).resolves.toEqual({ duplicate: true });
    http.mockResolvedValueOnce(new Response(null, { status: 410 }));
    await expect(
      google.event("alice", "token", "mapped", "DELETE"),
    ).resolves.toEqual({});
    http.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(google.revoke("alice", "token")).resolves.toBeUndefined();
  });
  it("accepts only a successful canonical Google Meet video entry point", () => {
    const event = (uri: string, statusCode = "success") => ({
      conferenceData: {
        createRequest: { status: { statusCode } },
        entryPoints: [{ entryPointType: "video", uri }],
      },
    });
    expect(conferenceLink(event("https://meet.google.com/abc-defg-hij"))).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    for (const url of [
      "https://evil.test/abc-defg-hij",
      "https://meet.google.com.evil.test/abc-defg-hij",
      "http://meet.google.com/abc-defg-hij",
      "https://meet.google.com/abc-defg-hij?token=secret",
    ])
      expect(conferenceLink(event(url))).toBeNull();
    expect(
      conferenceLink(event("https://meet.google.com/abc-defg-hij", "pending")),
    ).toBeNull();
  });
});
