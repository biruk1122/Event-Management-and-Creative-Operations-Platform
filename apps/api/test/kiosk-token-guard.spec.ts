import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import type { KioskAuthRecord } from "../src/attendance/kiosk/infrastructure/kiosk.repository.js";
import { KioskTokenGuard } from "../src/attendance/kiosk/kiosk-token.guard.js";
import { hashKioskToken } from "../src/attendance/kiosk/kiosk-token.js";

const RAW_TOKEN = "correct-kiosk-secret";

function makeKiosk(overrides: Partial<KioskAuthRecord> = {}): KioskAuthRecord {
  return {
    id: "kiosk-1",
    name: "Front Desk",
    locationLabel: "Main Office",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    revokedAt: null,
    tokenHash: hashKioskToken(RAW_TOKEN),
    ...overrides,
  };
}

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = {
    header: (name: string) => headers[name.toLowerCase()],
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(code);
  });
}

describe("KioskTokenGuard", () => {
  let kiosks: { findAuthById: ReturnType<typeof vi.fn> };
  let guard: KioskTokenGuard;

  beforeEach(() => {
    kiosks = { findAuthById: vi.fn().mockResolvedValue(makeKiosk()) };
    guard = new KioskTokenGuard(kiosks as never);
  });

  it("allows a request with a matching id and token, and attaches kiosk identity", async () => {
    const request = {
      header: (name: string) =>
        ({ "x-kiosk-id": "kiosk-1", "x-kiosk-token": RAW_TOKEN })[
          name.toLowerCase()
        ],
    } as unknown as Record<string, unknown>;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as { kiosk?: unknown }).kiosk).toEqual({
      id: "kiosk-1",
      name: "Front Desk",
    });
  });

  it("rejects when the X-Kiosk-Id header is missing", async () => {
    const context = makeContext({ "x-kiosk-token": RAW_TOKEN });
    await expectCode(guard.canActivate(context), ATTENDANCE_ERROR.kioskInvalid);
    expect(kiosks.findAuthById).not.toHaveBeenCalled();
  });

  it("rejects when the X-Kiosk-Token header is missing", async () => {
    const context = makeContext({ "x-kiosk-id": "kiosk-1" });
    await expectCode(guard.canActivate(context), ATTENDANCE_ERROR.kioskInvalid);
    expect(kiosks.findAuthById).not.toHaveBeenCalled();
  });

  it("rejects when no active kiosk matches the id (unknown, revoked, or inactive)", async () => {
    kiosks.findAuthById.mockResolvedValue(null);
    const context = makeContext({
      "x-kiosk-id": "kiosk-1",
      "x-kiosk-token": RAW_TOKEN,
    });
    await expectCode(guard.canActivate(context), ATTENDANCE_ERROR.kioskInvalid);
  });

  it("rejects when the token does not match the stored hash", async () => {
    const context = makeContext({
      "x-kiosk-id": "kiosk-1",
      "x-kiosk-token": "wrong-secret",
    });
    await expectCode(guard.canActivate(context), ATTENDANCE_ERROR.kioskInvalid);
  });

  it("never trusts a client-supplied id alone without the matching token", async () => {
    kiosks.findAuthById.mockResolvedValue(makeKiosk({ id: "some-other-id" }));
    const context = makeContext({
      "x-kiosk-id": "some-other-id",
      "x-kiosk-token": "guessed",
    });
    await expectCode(guard.canActivate(context), ATTENDANCE_ERROR.kioskInvalid);
  });
});
