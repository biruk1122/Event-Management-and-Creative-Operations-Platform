import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProblemDetails } from "@/lib/api/problem-details";

import { fetchCurrentUser, login, logout } from "./auth-gateway";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { POST: post, GET: get },
}));

const user = {
  id: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  email: "manager@example.com",
  status: "ACTIVE" as const,
};

function problem(overrides: Record<string, unknown>): ProblemDetails {
  return {
    type: "https://api.event-platform.local/problems/x",
    title: "Error",
    status: 400,
    detail: "detail",
    instance: "/api/v1/auth/login",
    code: "X",
    requestId: "req-1",
    ...overrides,
  } as unknown as ProblemDetails;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
});

describe("login", () => {
  it("returns success and the user on 200", async () => {
    post.mockResolvedValue({
      data: { user },
      error: undefined,
      response: { status: 200, ok: true },
    });

    await expect(login({ email: user.email, password: "pw" })).resolves.toEqual(
      {
        outcome: { status: "success" },
        user,
      },
    );
    expect(post).toHaveBeenCalledWith("/api/v1/auth/login", {
      body: { email: user.email, password: "pw" },
    });
  });

  it.each([
    ["AUTH_INVALID_CREDENTIALS", 401, "invalid_credentials"],
    ["AUTH_ACCOUNT_LOCKED", 403, "account_locked"],
    ["AUTH_ACCOUNT_INACTIVE", 403, "account_inactive"],
    ["AUTH_RATE_LIMITED", 429, "rate_limited"],
  ] as const)("maps %s to %s", async (code, status, mapped) => {
    post.mockResolvedValue({
      data: undefined,
      error: problem({ code, status }),
      response: { status, ok: false },
    });

    await expect(login({ email: user.email, password: "pw" })).resolves.toEqual(
      { outcome: { status: mapped }, user: null },
    );
  });

  it("maps a validation problem to field errors", async () => {
    post.mockResolvedValue({
      data: undefined,
      error: problem({
        code: "VALIDATION_ERROR",
        status: 400,
        errors: { email: ["Enter a valid email address."] },
      }),
      response: { status: 400, ok: false },
    });

    await expect(login({ email: "bad", password: "pw" })).resolves.toEqual({
      outcome: {
        status: "field_errors",
        fieldErrors: { email: "Enter a valid email address." },
      },
      user: null,
    });
  });

  it("falls back to unexpected for an unknown failure", async () => {
    post.mockResolvedValue({
      data: undefined,
      error: problem({ code: "SOMETHING_ELSE", status: 500 }),
      response: { status: 500, ok: false },
    });

    await expect(login({ email: user.email, password: "pw" })).resolves.toEqual(
      { outcome: { status: "unexpected" }, user: null },
    );
  });
});

describe("logout", () => {
  it("sends the CSRF token from the cookie and resolves on success", async () => {
    document.cookie = "csrf_token=csrf-abc";
    post.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { status: 204, ok: true },
    });

    await expect(logout()).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith("/api/v1/auth/logout", {
      headers: { "x-csrf-token": "csrf-abc" },
    });
  });

  it("throws when the request fails", async () => {
    post.mockResolvedValue({
      data: undefined,
      error: problem({ code: "CSRF_TOKEN_INVALID", status: 403 }),
      response: { status: 403, ok: false },
    });

    await expect(logout()).rejects.toThrow(/logout/);
  });
});

describe("fetchCurrentUser", () => {
  it("returns the account on 200", async () => {
    get.mockResolvedValue({
      data: user,
      error: undefined,
      response: { status: 200, ok: true },
    });

    await expect(fetchCurrentUser()).resolves.toEqual(user);
  });

  it("returns null on 401", async () => {
    get.mockResolvedValue({
      data: undefined,
      error: problem({ code: "AUTH_UNAUTHENTICATED", status: 401 }),
      response: { status: 401, ok: false },
    });

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("throws on an unexpected status", async () => {
    get.mockResolvedValue({
      data: undefined,
      error: problem({ code: "INTERNAL_SERVER_ERROR", status: 500 }),
      response: { status: 500, ok: false },
    });

    await expect(fetchCurrentUser()).rejects.toThrow(/me/);
  });
});
