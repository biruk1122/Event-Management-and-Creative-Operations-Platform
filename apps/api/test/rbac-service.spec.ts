import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PermissionRecord,
  RoleRecord,
  RoleWithGrantsRecord,
} from "../src/rbac/infrastructure/rbac.repository.js";
import { RbacService } from "../src/rbac/rbac.service.js";

const ACTOR = "actor-1";

function makeRole(overrides: Partial<RoleRecord> = {}): RoleRecord {
  return {
    id: "role-1",
    name: "Regional Coordinator",
    description: null,
    isSystem: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
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

describe("RbacService", () => {
  let repository: {
    listRoles: ReturnType<typeof vi.fn>;
    findRoleById: ReturnType<typeof vi.fn>;
    findRoleSummary: ReturnType<typeof vi.fn>;
    createRole: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
    deleteRole: ReturnType<typeof vi.fn>;
    addGrant: ReturnType<typeof vi.fn>;
    removeGrant: ReturnType<typeof vi.fn>;
    listPermissions: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let service: RbacService;

  beforeEach(() => {
    repository = {
      listRoles: vi.fn(),
      findRoleById: vi.fn(),
      findRoleSummary: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      addGrant: vi.fn(),
      removeGrant: vi.fn(),
      listPermissions: vi.fn(),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new RbacService(repository as never, permissions as never);
  });

  function denyNextCheck(): void {
    permissions.hasGrant.mockResolvedValueOnce(false);
  }

  describe("listRoles", () => {
    it("denies a caller without role.read", async () => {
      denyNextCheck();
      await expectCode(service.listRoles(ACTOR), "PERMISSION_DENIED");
      expect(repository.listRoles).not.toHaveBeenCalled();
    });

    it("checks role.read at organization scope and maps every role", async () => {
      repository.listRoles.mockResolvedValue([makeRole()]);

      const result = await service.listRoles(ACTOR);

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "role.read",
        "ORGANIZATION",
      );
      expect(result).toEqual([
        {
          id: "role-1",
          name: "Regional Coordinator",
          description: null,
          isSystem: false,
          createdAt: makeRole().createdAt,
          updatedAt: makeRole().updatedAt,
        },
      ]);
    });
  });

  describe("getRole", () => {
    it("denies a caller without role.read", async () => {
      denyNextCheck();
      await expectCode(service.getRole(ACTOR, "role-1"), "PERMISSION_DENIED");
      expect(repository.findRoleById).not.toHaveBeenCalled();
    });

    it("reports not found when the role does not exist", async () => {
      repository.findRoleById.mockResolvedValue(null);
      await expectCode(service.getRole(ACTOR, "missing"), "ROLE_NOT_FOUND");
    });

    it("returns the role with its grants", async () => {
      const withGrants: RoleWithGrantsRecord = {
        ...makeRole(),
        grants: [{ permissionKey: "task.review", scope: "ORGANIZATION" }],
      };
      repository.findRoleById.mockResolvedValue(withGrants);

      const result = await service.getRole(ACTOR, "role-1");

      expect(result.grants).toEqual([
        { permissionKey: "task.review", scope: "ORGANIZATION" },
      ]);
    });
  });

  describe("createRole", () => {
    it("denies a caller without role.create", async () => {
      denyNextCheck();
      await expectCode(
        service.createRole(ACTOR, { name: "New Role" }),
        "PERMISSION_DENIED",
      );
      expect(repository.createRole).not.toHaveBeenCalled();
    });

    it("reports a conflict for a duplicate name", async () => {
      repository.createRole.mockResolvedValue(null);
      await expectCode(
        service.createRole(ACTOR, { name: "Team Member" }),
        "ROLE_NAME_CONFLICT",
      );
    });

    it("defaults a missing description to null and returns the created role", async () => {
      repository.createRole.mockResolvedValue(makeRole({ name: "New Role" }));

      const result = await service.createRole(ACTOR, { name: "New Role" });

      expect(repository.createRole).toHaveBeenCalledWith({
        name: "New Role",
        description: null,
      });
      expect(result.name).toBe("New Role");
    });
  });

  describe("updateRole", () => {
    it("denies a caller without role.update", async () => {
      denyNextCheck();
      await expectCode(
        service.updateRole(ACTOR, "role-1", {}),
        "PERMISSION_DENIED",
      );
      expect(repository.updateRole).not.toHaveBeenCalled();
    });

    it("reports not found", async () => {
      repository.updateRole.mockResolvedValue("not_found");
      await expectCode(
        service.updateRole(ACTOR, "missing", {}),
        "ROLE_NOT_FOUND",
      );
    });

    it("reports a name conflict", async () => {
      repository.updateRole.mockResolvedValue("name_conflict");
      await expectCode(
        service.updateRole(ACTOR, "role-1", { name: "Team Member" }),
        "ROLE_NAME_CONFLICT",
      );
    });

    it("returns the updated role on success", async () => {
      repository.updateRole.mockResolvedValue(
        makeRole({ description: "Updated" }),
      );
      const result = await service.updateRole(ACTOR, "role-1", {
        description: "Updated",
      });
      expect(result.description).toBe("Updated");
    });
  });

  describe("deleteRole", () => {
    it("denies a caller without role.delete", async () => {
      denyNextCheck();
      await expectCode(
        service.deleteRole(ACTOR, "role-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.findRoleSummary).not.toHaveBeenCalled();
    });

    it("reports not found before attempting to delete", async () => {
      repository.findRoleSummary.mockResolvedValue(null);
      await expectCode(service.deleteRole(ACTOR, "missing"), "ROLE_NOT_FOUND");
      expect(repository.deleteRole).not.toHaveBeenCalled();
    });

    it("refuses to delete a system role without touching the repository delete", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: true,
      });
      await expectCode(service.deleteRole(ACTOR, "role-1"), "ROLE_IS_SYSTEM");
      expect(repository.deleteRole).not.toHaveBeenCalled();
    });

    it("reports the role as in use", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.deleteRole.mockResolvedValue("in_use");
      await expectCode(service.deleteRole(ACTOR, "role-1"), "ROLE_IN_USE");
    });

    it("deletes a non-system, unassigned role", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.deleteRole.mockResolvedValue("deleted");
      await expect(
        service.deleteRole(ACTOR, "role-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("addPermission", () => {
    it("denies a caller without role.configure_permissions", async () => {
      denyNextCheck();
      await expectCode(
        service.addPermission(ACTOR, "role-1", {
          permissionKey: "task.review",
          scope: "ORGANIZATION",
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.findRoleSummary).not.toHaveBeenCalled();
    });

    it("rejects an unknown permission key without querying the role", async () => {
      await expectCode(
        service.addPermission(ACTOR, "role-1", {
          permissionKey: "not.a.real.key",
          scope: "ORGANIZATION",
        }),
        "PERMISSION_NOT_FOUND",
      );
      expect(repository.findRoleSummary).not.toHaveBeenCalled();
    });

    it("reports not found for a missing role", async () => {
      repository.findRoleSummary.mockResolvedValue(null);
      await expectCode(
        service.addPermission(ACTOR, "missing", {
          permissionKey: "task.review",
          scope: "ORGANIZATION",
        }),
        "ROLE_NOT_FOUND",
      );
    });

    it("reports a duplicate grant", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.addGrant.mockResolvedValue("already_exists");
      await expectCode(
        service.addPermission(ACTOR, "role-1", {
          permissionKey: "task.review",
          scope: "ORGANIZATION",
        }),
        "GRANT_ALREADY_EXISTS",
      );
    });

    it("adds the grant on success", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.addGrant.mockResolvedValue("added");
      await expect(
        service.addPermission(ACTOR, "role-1", {
          permissionKey: "task.review",
          scope: "ORGANIZATION",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("removePermission", () => {
    it("denies a caller without role.configure_permissions", async () => {
      denyNextCheck();
      await expectCode(
        service.removePermission(
          ACTOR,
          "role-1",
          "task.review",
          "ORGANIZATION",
        ),
        "PERMISSION_DENIED",
      );
      expect(repository.findRoleSummary).not.toHaveBeenCalled();
    });

    it("reports not found for a missing role", async () => {
      repository.findRoleSummary.mockResolvedValue(null);
      await expectCode(
        service.removePermission(
          ACTOR,
          "missing",
          "task.review",
          "ORGANIZATION",
        ),
        "ROLE_NOT_FOUND",
      );
    });

    it("reports not found for a grant the role does not hold", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.removeGrant.mockResolvedValue("not_found");
      await expectCode(
        service.removePermission(
          ACTOR,
          "role-1",
          "task.review",
          "ORGANIZATION",
        ),
        "GRANT_NOT_FOUND",
      );
    });

    it("removes the grant on success", async () => {
      repository.findRoleSummary.mockResolvedValue({
        id: "role-1",
        isSystem: false,
      });
      repository.removeGrant.mockResolvedValue("removed");
      await expect(
        service.removePermission(
          ACTOR,
          "role-1",
          "task.review",
          "ORGANIZATION",
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("listPermissions", () => {
    it("denies a caller without role.read", async () => {
      denyNextCheck();
      await expectCode(service.listPermissions(ACTOR), "PERMISSION_DENIED");
      expect(repository.listPermissions).not.toHaveBeenCalled();
    });

    it("maps the catalog", async () => {
      const record: PermissionRecord = {
        key: "task.review",
        description: "Review a submitted task.",
      };
      repository.listPermissions.mockResolvedValue([record]);
      await expect(service.listPermissions(ACTOR)).resolves.toEqual([record]);
    });
  });
});
