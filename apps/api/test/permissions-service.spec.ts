import { describe, expect, it, vi } from "vitest";

import { PermissionsService } from "../src/common/security/permissions.service.js";
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
        : { role: { rolePermissions: options.roleGrants } };

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

    it("matches a baseline grant", async () => {
      const service = new PermissionsService(
        makeDb({
          baseline: [
            { permissionKey: "directory.read", scope: "ORGANIZATION" },
          ],
        }),
      );

      await expect(
        service.hasGrant("user-1", "directory.read", "ORGANIZATION"),
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
