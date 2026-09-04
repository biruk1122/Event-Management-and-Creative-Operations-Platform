import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_COOKIE,
  AuthCookies,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  durationToMs,
} from "../src/auth/auth-cookies.js";
import type { Environment } from "../src/config/environment.js";

const environment = {
  AUTH_COOKIE_SECURE: true,
  AUTH_COOKIE_SAME_SITE: "strict",
  AUTH_ACCESS_TOKEN_TTL: "15m",
  AUTH_REFRESH_TOKEN_TTL: "30d",
} as unknown as Environment;

interface RecordedCookie {
  name: string;
  value?: string;
  options: Record<string, unknown>;
}

function fakeResponse() {
  const set: RecordedCookie[] = [];
  const cleared: RecordedCookie[] = [];
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      set.push({ name, value, options });
      return response;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, options });
      return response;
    },
  };
  return { response: response as unknown as Response, set, cleared };
}

function fakeRequest(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

describe("AuthCookies", () => {
  const cookies = new AuthCookies(environment);

  it("issues three cookies with the expected attributes", () => {
    const { response, set } = fakeResponse();

    const csrf = cookies.issueSessionCookies(response, {
      accessToken: "access.jwt",
      refreshToken: "refresh-opaque",
    });

    const byName = Object.fromEntries(set.map((entry) => [entry.name, entry]));

    expect(byName[ACCESS_TOKEN_COOKIE]!.value).toBe("access.jwt");
    expect(byName[ACCESS_TOKEN_COOKIE]!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 900_000,
    });

    expect(byName[REFRESH_TOKEN_COOKIE]!.value).toBe("refresh-opaque");
    expect(byName[REFRESH_TOKEN_COOKIE]!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 2_592_000_000,
    });

    expect(byName[CSRF_TOKEN_COOKIE]!.value).toBe(csrf);
    expect(byName[CSRF_TOKEN_COOKIE]!.options).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  });

  it("clears every session cookie on the matching path", () => {
    const { response, cleared } = fakeResponse();

    cookies.clearSessionCookies(response);

    expect(cleared.map((entry) => entry.name).sort()).toEqual(
      [ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE].sort(),
    );
    const refresh = cleared.find((c) => c.name === REFRESH_TOKEN_COOKIE);
    expect(refresh!.options).toMatchObject({ path: "/api/v1/auth" });
  });

  it("reads named cookies and ignores empty values", () => {
    const request = fakeRequest({
      access_token: "a",
      refresh_token: "r",
      csrf_token: "",
    });

    expect(cookies.readAccessToken(request)).toBe("a");
    expect(cookies.readRefreshToken(request)).toBe("r");
    expect(cookies.readCsrfCookie(request)).toBeUndefined();
    expect(cookies.readAccessToken(fakeRequest({}))).toBeUndefined();
  });
});

describe("durationToMs", () => {
  it("parses supported units and bare seconds", () => {
    expect(durationToMs("15m")).toBe(900_000);
    expect(durationToMs("30d")).toBe(2_592_000_000);
    expect(durationToMs("2h")).toBe(7_200_000);
    expect(durationToMs("750ms")).toBe(750);
    expect(durationToMs("90")).toBe(90_000);
  });

  it("throws on an unsupported duration", () => {
    expect(() => durationToMs("soon")).toThrow();
  });
});
