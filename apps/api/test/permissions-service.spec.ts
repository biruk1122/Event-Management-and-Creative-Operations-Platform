import { describe, expect, it, vi } from "vitest";

import {
  clearPermissionMemo,
  PermissionsService,
  runWithPermissionMemo,
} from "../src/common/security/permissions.service.js";
import type { DatabaseService } from "../src/database/database.service.js";

interface Grant {
  permissionKey: string;
  scope: string;
}

function makeDb(options: {
  baseline?: Grant[];
  roleGrants?: Grant[] | null;
}): DatabaseService {
  const assignment =
    options.roleGrants === undefined
      ? null
      : options.roleGrants === null
        ? null
        : {
            role: {
              name: "Super Admin",
              isSystem: true,
              rolePermissions: options.roleGrants,
            },
            user: { department: null },
          };

  return {
    baselineGrant: {
      findMany: vi.fn().mockResolvedValue(options.baseline ?? []),
    },
    userRoleAssignment: {
      findUnique: vi.fn().mockResolvedValue(assignment),
    },
  } as unknown as DatabaseService;
}

describe("PermissionsService", () => {
  describe("getPermissionKeys", () => {
    it("returns only baseline keys for a user with no role assignment", async () => {
      const service = new PermissionsService(
        makeDb({
          baseline: [{ permissionKey: "profile.read", scope: "SELF" }],
        }),
      );

      await expect(service.getPermissionKeys("user-1")).resolves.toEqual(
        new Set(["profile.read"]),
      );
    });

    it("unions baseline keys with the assigned role's keys", async () => {
      const service = new PermissionsService(
        makeDb({
          baseline: [{ permissionKey: "profile.read", scope: "SELF" }],
          roleGrants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
        }),
      );

      await expect(service.getPermissionKeys("user-1")).resolves.toEqual(
        new Set(["profile.read", "role.read"]),
      );
    });

    it("deduplicates a key granted at more than one scope", async () => {
      const service = new PermissionsService(
        makeDb({
          baseline: [{ permissionKey: "calendar.read", scope: "SELF" }],
          roleGrants: [
            { permissionKey: "calendar.read", scope: "ORGANIZATION" },
          ],
        }),
      );

      await expect(service.getPermissionKeys("user-1")).resolves.toEqual(
        new Set(["calendar.read"]),
      );
    });

    it("returns an empty set for a user with no baseline and no role", async () => {
      const service = new PermissionsService(makeDb({}));

      await expect(service.getPermissionKeys("user-1")).resolves.toEqual(
        new Set(),
      );
    });
  });

  describe("hasGrant", () => {
    it("matches an exact key and scope from the assigned role", async () => {
      const service = new PermissionsService(
        makeDb({
          roleGrants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
        }),
      );

      await expect(
        service.hasGrant("user-1", "role.read", "ORGANIZATION"),
      ).resolves.toBe(true);
    });

    it("rejects the same key held only at a different scope", async () => {
      const service = new PermissionsService(
        makeDb({ roleGrants: [{ permissionKey: "role.read", scope: "SELF" }] }),
      );

      await expect(
        service.hasGrant("user-1", "role.read", "ORGANIZATION"),
      ).resolves.toBe(false);
    });

    it("matches an allowed profile baseline grant without a role", async () => {
      const service = new PermissionsService(
        makeDb({
          baseline: [{ permissionKey: "profile.read", scope: "SELF" }],
        }),
      );

      await expect(
        service.hasGrant("user-1", "profile.read", "SELF"),
      ).resolves.toBe(true);
    });

    it("rejects a key the user does not hold at all", async () => {
      const service = new PermissionsService(makeDb({}));

      await expect(
        service.hasGrant("user-1", "role.delete", "ORGANIZATION"),
      ).resolves.toBe(false);
    });
  });
});

describe("request-scoped permission memo", () => {
  function counted(options: {
    baseline?: Grant[];
    roleGrants?: Grant[] | null;
  }) {
    const db = makeDb(options) as unknown as {
      baselineGrant: { findMany: ReturnType<typeof vi.fn> };
      userRoleAssignment: { findUnique: ReturnType<typeof vi.fn> };
    };
    return {
      db,
      service: new PermissionsService(db as unknown as DatabaseService),
    };
  }

  it("loads a user's grants once per request however often they are checked", async () => {
    const { db, service } = counted({
      baseline: [{ permissionKey: "profile.read", scope: "SELF" }],
      roleGrants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
    });
    await runWithPermissionMemo(async () => {
      await service.getEffectiveGrants("user-1");
      await service.hasGrant("user-1", "role.read", "ORGANIZATION");
      await service.getPermissionKeys("user-1");
      await service.getAccessContext("user-1");
      await service.getAccessContext("user-1");
    });
    expect(db.baselineGrant.findMany).toHaveBeenCalledTimes(1);
    // Grants and access context are separate lookups, one assignment read each.
    expect(db.userRoleAssignment.findUnique).toHaveBeenCalledTimes(2);
  });

  it("does not cache outside a request", async () => {
    const { db, service } = counted({ baseline: [] });
    await service.getEffectiveGrants("user-1");
    await service.getEffectiveGrants("user-1");
    expect(db.baselineGrant.findMany).toHaveBeenCalledTimes(2);
  });

  it("never serves one user's lookup to another user in the same request", async () => {
    const { db, service } = counted({ baseline: [] });
    await runWithPermissionMemo(async () => {
      await service.getEffectiveGrants("user-1");
      await service.getEffectiveGrants("user-2");
    });
    expect(db.baselineGrant.findMany).toHaveBeenCalledTimes(2);
  });

  it("reads fresh grants after a write clears the memo in the same request", async () => {
    const { db, service } = counted({ baseline: [] });
    await runWithPermissionMemo(async () => {
      await service.getEffectiveGrants("user-1");
      clearPermissionMemo();
      await service.getEffectiveGrants("user-1");
    });
    expect(db.baselineGrant.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed lookup, so a retry in the same request can succeed", async () => {
    const { db, service } = counted({ baseline: [] });
    db.baselineGrant.findMany
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce([]);
    await runWithPermissionMemo(async () => {
      await expect(service.getEffectiveGrants("user-1")).rejects.toThrow(
        "database unavailable",
      );
      await expect(service.getEffectiveGrants("user-1")).resolves.toEqual([]);
    });
    expect(db.baselineGrant.findMany).toHaveBeenCalledTimes(2);
  });
});
