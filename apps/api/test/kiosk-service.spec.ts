import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import type { KioskRecord } from "../src/attendance/kiosk/infrastructure/kiosk.repository.js";
import { KioskService } from "../src/attendance/kiosk/kiosk.service.js";
import { SECURITY_ERROR } from "../src/common/security/security.errors.js";

function makeKiosk(overrides: Partial<KioskRecord> = {}): KioskRecord {
  return {
    id: "kiosk-1",
    name: "Front Desk",
    locationLabel: "Main Office",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    revokedAt: null,
    ...overrides,
  };
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

describe("KioskService", () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let service: KioskService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(makeKiosk()),
      list: vi.fn().mockResolvedValue([makeKiosk()]),
      revoke: vi.fn().mockResolvedValue("revoked"),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new KioskService(repository as never, permissions as never);
  });

  describe("authorization boundary", () => {
    it("denies register when the caller lacks attendance.kiosk.manage", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.register("user-1", { name: "x", locationLabel: "y" }),
        SECURITY_ERROR.permissionDenied,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("denies list when the caller lacks attendance.kiosk.manage", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(service.list("user-1"), SECURITY_ERROR.permissionDenied);
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("denies revoke when the caller lacks attendance.kiosk.manage", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.revoke("user-1", "kiosk-1"),
        SECURITY_ERROR.permissionDenied,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it("checks the grant at ORGANIZATION scope", async () => {
      await service.list("user-1");
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        "user-1",
        "attendance.kiosk.manage",
        "ORGANIZATION",
      );
    });
  });

  describe("register", () => {
    it("returns the plaintext token exactly once alongside the kiosk record", async () => {
      const result = await service.register("user-1", {
        name: "Front Desk",
        locationLabel: "Main Office",
      });
      expect(result.id).toBe("kiosk-1");
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
    });

    it("persists only a hash of the token, never the plaintext", async () => {
      const result = await service.register("user-1", {
        name: "Front Desk",
        locationLabel: "Main Office",
      });
      const createInput = repository.create.mock.calls[0]![0] as {
        tokenHash: string;
      };
      expect(createInput.tokenHash).not.toBe(result.token);
      expect(createInput.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("list", () => {
    it("maps every kiosk record to its response shape", async () => {
      const result = await service.list("user-1");
      expect(result).toEqual([
        {
          id: "kiosk-1",
          name: "Front Desk",
          locationLabel: "Main Office",
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          revokedAt: null,
        },
      ]);
    });
  });

  describe("revoke", () => {
    it("throws kioskNotFound when the repository reports not_found", async () => {
      repository.revoke.mockResolvedValue("not_found");
      await expectCode(
        service.revoke("user-1", "missing"),
        ATTENDANCE_ERROR.kioskNotFound,
      );
    });

    it("succeeds silently when the repository reports revoked", async () => {
      await expect(
        service.revoke("user-1", "kiosk-1"),
      ).resolves.toBeUndefined();
    });
  });
});
