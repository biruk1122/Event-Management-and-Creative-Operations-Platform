import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

import { ENVIRONMENT, type Environment } from "../config/environment.js";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_TOKEN_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

/** The refresh cookie is only sent to the authentication routes. */
const REFRESH_COOKIE_PATH = "/api/v1/auth";

@Injectable()
export class AuthCookies {
  private readonly secure: boolean;
  private readonly sameSite: "lax" | "strict" | "none";
  private readonly accessMaxAgeMs: number;
  private readonly refreshMaxAgeMs: number;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.secure = environment.AUTH_COOKIE_SECURE;
    this.sameSite = environment.AUTH_COOKIE_SAME_SITE;
    this.accessMaxAgeMs = durationToMs(environment.AUTH_ACCESS_TOKEN_TTL);
    this.refreshMaxAgeMs = durationToMs(environment.AUTH_REFRESH_TOKEN_TTL);
  }

  private base(path: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      path,
    };
  }

  issueSessionCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): string {
    const csrfToken = randomBytes(32).toString("base64url");

    response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.base("/"),
      maxAge: this.accessMaxAgeMs,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.base(REFRESH_COOKIE_PATH),
      maxAge: this.refreshMaxAgeMs,
    });
    response.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
      httpOnly: false,
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
      maxAge: this.refreshMaxAgeMs,
    });

    return csrfToken;
  }

  clearSessionCookies(response: Response): void {
    response.clearCookie(ACCESS_TOKEN_COOKIE, this.base("/"));
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.base(REFRESH_COOKIE_PATH));
    response.clearCookie(CSRF_TOKEN_COOKIE, {
      httpOnly: false,
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
    });
  }

  readAccessToken(request: Request): string | undefined {
    return readCookie(request, ACCESS_TOKEN_COOKIE);
  }

  readRefreshToken(request: Request): string | undefined {
    return readCookie(request, REFRESH_TOKEN_COOKIE);
  }

  readCsrfCookie(request: Request): string | undefined {
    return readCookie(request, CSRF_TOKEN_COOKIE);
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies = (request as { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Convert a `15m` / `30d` / `900s` style duration to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber * 1000;
    }
    throw new Error(`Unsupported duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as "ms" | "s" | "m" | "h" | "d";
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factor[unit];
}
