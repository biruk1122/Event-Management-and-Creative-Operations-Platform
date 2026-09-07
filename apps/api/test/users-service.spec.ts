import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../src/users/infrastructure/users.repository.js";
import { UsersService } from "../src/users/users.service.js";

const ACTOR = "actor-1";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: null,
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: null,
    mustChangePassword: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
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

describe("UsersService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    roleExists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    setRole: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let passwordHasher: { hash: ReturnType<typeof vi.fn> };
  let service: UsersService;

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      findById: vi.fn(),
      roleExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
      setRole: vi.fn(),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    passwordHasher = { hash: vi.fn().mockResolvedValue("argon2id$hash") };
    service = new UsersService(
      repository as never,
      permissions as never,
      passwordHasher as never,
    );
  });

  function denyNextCheck(): void {
    permissions.hasGrant.mockResolvedValueOnce(false);
  }

  describe("authorization", () => {
    it.each([
      ["list", () => service.list(ACTOR, { page: 1, pageSize: 25 })],
      ["get", () => service.get(ACTOR, "user-1")],
      [
        "create",
        () =>
          service.create(ACTOR, {
            email: "x@example.com",
            firstName: "X",
            lastName: "Y",
            temporaryPassword: "password123",
          }),
      ],
      ["update", () => service.update(ACTOR, "user-1", { firstName: "Z" })],
      ["deactivate", () => service.deactivate(ACTOR, "user-1")],
      ["reactivate", () => service.reactivate(ACTOR, "user-1")],
      ["assignRole", () => service.assignRole(ACTOR, "user-1", null)],
    ])("%s denies before touching the repository", async (_name, call) => {
      denyNextCheck();
      await expectCode(call(), "PERMISSION_DENIED");
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.setStatus).not.toHaveBeenCalled();
      expect(repository.setRole).not.toHaveBeenCalled();
    });

    it.each([
      [
        "list",
        "user.read",
        () => service.list(ACTOR, { page: 1, pageSize: 25 }),
      ],
      ["get", "user.read", () => service.get(ACTOR, "user-1")],
      [
        "create",
        "user.create",
        () =>
          service.create(ACTOR, {
            email: "x@example.com",
            firstName: "X",
            lastName: "Y",
            temporaryPassword: "password123",
          }),
      ],
      [
        "update",
        "user.update",
        () => service.update(ACTOR, "user-1", { firstName: "Z" }),
      ],
      ["deactivate", "user.deactivate", () => service.deactivate(ACTOR, "u")],
      [
        "reactivate",
        "user.manage_status",
        () => service.reactivate(ACTOR, "u"),
      ],
      [
        "assignRole",
        "user.assign_role",
        () => service.assignRole(ACTOR, "user-1", null),
      ],
    ])(
      "%s checks the %s grant at organization scope",
      async (_name, key, call) => {
        repository.list.mockResolvedValue({ items: [], total: 0 });
        repository.findById.mockResolvedValue(makeUser());
        repository.create.mockResolvedValue(makeUser());
        repository.update.mockResolvedValue(makeUser());
        repository.setStatus.mockResolvedValue(makeUser());
        repository.setRole.mockResolvedValue(makeUser());

        // The grant is checked first; the call itself may still fail a policy
        // rule afterwards (e.g. reactivating an already-active user), which is
        // irrelevant to this assertion.
        await call().catch(() => undefined);

        expect(permissions.hasGrant).toHaveBeenCalledWith(
          ACTOR,
          key,
          "ORGANIZATION",
        );
      },
    );
  });

  describe("create", () => {
    it("rejects an unknown roleId before hashing or writing", async () => {
      repository.roleExists.mockResolvedValue(false);
      await expectCode(
        service.create(ACTOR, {
          email: "new@example.com",
          firstName: "New",
          lastName: "User",
          temporaryPassword: "password123",
          roleId: "11111111-1111-1111-1111-111111111111",
        }),
        "ROLE_NOT_FOUND",
      );
      expect(passwordHasher.hash).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("lowercases the email and flags the credential for rotation via the repository", async () => {
      repository.create.mockResolvedValue(makeUser());
      await service.create(ACTOR, {
        email: "Ada@Example.COM",
        firstName: "Ada",
        lastName: "Lovelace",
        temporaryPassword: "password123",
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "ada@example.com",
          passwordHash: "argon2id$hash",
          roleId: null,
        }),
      );
    });

    it("maps an email conflict", async () => {
      repository.create.mockResolvedValue("email_conflict");
      await expectCode(
        service.create(ACTOR, {
          email: "dupe@example.com",
          firstName: "Dup",
          lastName: "Licate",
          temporaryPassword: "password123",
        }),
        "USER_EMAIL_CONFLICT",
      );
    });
  });

  describe("update", () => {
    it("maps not-found and email conflict", async () => {
      repository.update.mockResolvedValueOnce("not_found");
      await expectCode(
        service.update(ACTOR, "missing", { firstName: "Z" }),
        "USER_NOT_FOUND",
      );

      repository.update.mockResolvedValueOnce("email_conflict");
      await expectCode(
        service.update(ACTOR, "user-1", { email: "taken@example.com" }),
        "USER_EMAIL_CONFLICT",
      );
    });

    it("passes only the provided fields through", async () => {
      repository.update.mockResolvedValue(makeUser());
      await service.update(ACTOR, "user-1", { firstName: "Grace" });
      expect(repository.update).toHaveBeenCalledWith("user-1", {
        firstName: "Grace",
      });
    });
  });

  describe("deactivate", () => {
    it("404s an unknown user", async () => {
      repository.findById.mockResolvedValue(null);
      await expectCode(service.deactivate(ACTOR, "missing"), "USER_NOT_FOUND");
    });

    it("409s a user that is already inactive", async () => {
      repository.findById.mockResolvedValue(makeUser({ status: "INACTIVE" }));
      await expectCode(
        service.deactivate(ACTOR, "user-1"),
        "USER_ALREADY_INACTIVE",
      );
      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it("sets INACTIVE with a deactivation timestamp", async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.setStatus.mockResolvedValue(
        makeUser({ status: "INACTIVE", deactivatedAt: new Date() }),
      );
      const result = await service.deactivate(ACTOR, "user-1");
      expect(repository.setStatus).toHaveBeenCalledWith(
        "user-1",
        "INACTIVE",
        expect.any(Date),
      );
      expect(result.status).toBe("INACTIVE");
      expect(result.deactivatedAt).not.toBeNull();
    });
  });

  describe("reactivate", () => {
    it("409s a user that is already active", async () => {
      repository.findById.mockResolvedValue(makeUser({ status: "ACTIVE" }));
      await expectCode(
        service.reactivate(ACTOR, "user-1"),
        "USER_ALREADY_ACTIVE",
      );
    });

    it("clears the deactivation timestamp", async () => {
      repository.findById.mockResolvedValue(makeUser({ status: "INACTIVE" }));
      repository.setStatus.mockResolvedValue(makeUser({ status: "ACTIVE" }));
      await service.reactivate(ACTOR, "user-1");
      expect(repository.setStatus).toHaveBeenCalledWith(
        "user-1",
        "ACTIVE",
        null,
      );
    });
  });

  describe("assignRole", () => {
    it("maps a missing user and a missing role", async () => {
      repository.setRole.mockResolvedValueOnce("user_not_found");
      await expectCode(
        service.assignRole(ACTOR, "missing", "role-1"),
        "USER_NOT_FOUND",
      );

      repository.setRole.mockResolvedValueOnce("role_not_found");
      await expectCode(
        service.assignRole(ACTOR, "user-1", "role-x"),
        "ROLE_NOT_FOUND",
      );
    });

    it("clears the role when given null", async () => {
      repository.setRole.mockResolvedValue(makeUser({ role: null }));
      const result = await service.assignRole(ACTOR, "user-1", null);
      expect(repository.setRole).toHaveBeenCalledWith("user-1", null);
      expect(result.role).toBeNull();
    });
  });

  describe("response mapping", () => {
    it("serialises dates and never exposes credential internals", async () => {
      repository.findById.mockResolvedValue(
        makeUser({
          role: { id: "role-9", name: "Regional Coordinator" },
          deactivatedAt: new Date("2026-02-03T04:05:06Z"),
          status: "INACTIVE",
        }),
      );
      const result = await service.get(ACTOR, "user-1");
      expect(result).toEqual({
        id: "user-1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        phone: null,
        profileImage: null,
        status: "INACTIVE",
        deactivatedAt: "2026-02-03T04:05:06.000Z",
        role: { id: "role-9", name: "Regional Coordinator" },
        mustChangePassword: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
    });
  });
});
