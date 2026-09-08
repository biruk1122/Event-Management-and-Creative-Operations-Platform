import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamActivityFilter } from "../src/teams/dto/list-teams-query.dto.js";
import type { TeamRecord } from "../src/teams/infrastructure/teams.repository.js";
import { TeamsService } from "../src/teams/teams.service.js";
import type { PermissionScope } from "../src/generated/prisma/client.js";

const ACTOR = "actor-1";

function makeTeam(overrides: Partial<TeamRecord> = {}): TeamRecord {
  return {
    id: "team-1",
    name: "Production Team",
    description: "Delivers production.",
    department: { id: "dep-1", name: "Production" },
    manager: null,
    members: [],
    deactivatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
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

describe("TeamsService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    departmentExists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setManager: ReturnType<typeof vi.fn>;
    setDeactivated: ReturnType<typeof vi.fn>;
    deleteIfEmpty: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: TeamsService;

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      findById: vi.fn(),
      findUserDepartmentId: vi.fn(),
      departmentExists: vi.fn().mockResolvedValue(true),
      create: vi.fn(),
      update: vi.fn(),
      setManager: vi.fn(),
      setDeactivated: vi.fn(),
      deleteIfEmpty: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new TeamsService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("read authorization and scope", () => {
    it("denies list and get without any team.read grant", async () => {
      grantOnly();
      await expectCode(
        service.list(ACTOR, { page: 1, pageSize: 25 }),
        "PERMISSION_DENIED",
      );
      await expectCode(service.get(ACTOR, "team-1"), "PERMISSION_DENIED");
    });

    it("lists every team for an organization-scoped reader", async () => {
      grantOnly(["team.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list.mock.calls[0]?.[0]).not.toHaveProperty(
        "departmentIds",
      );
    });

    it("narrows an organization-scoped list to a requested department", async () => {
      grantOnly(["team.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, {
        page: 1,
        pageSize: 25,
        departmentId: "dep-7",
      });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: ["dep-7"] }),
      );
    });

    it("restricts a department-scoped reader's list to their own department", async () => {
      grantOnly(["team.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dep-9");
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: ["dep-9"] }),
      );
    });

    it("returns an empty page for a department-scoped reader with no department", async () => {
      grantOnly(["team.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue(null);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: [] }),
      );
    });

    it("gives a department-scoped reader nothing when they ask for another department", async () => {
      grantOnly(["team.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dep-1");
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, {
        page: 1,
        pageSize: 25,
        departmentId: "dep-2",
      });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: [] }),
      );
    });

    it("lets a department-scoped reader open only a team in their department", async () => {
      grantOnly(["team.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dep-1");
      repository.findById.mockResolvedValue(makeTeam());

      await expect(service.get(ACTOR, "team-1")).resolves.toMatchObject({
        id: "team-1",
      });

      repository.findById.mockResolvedValue(
        makeTeam({ department: { id: "dep-2", name: "Other" } }),
      );
      await expectCode(service.get(ACTOR, "team-2"), "PERMISSION_DENIED");
    });

    it("404s a get for a team that does not exist", async () => {
      grantOnly(["team.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(null);
      await expectCode(service.get(ACTOR, "ghost"), "TEAM_NOT_FOUND");
    });

    it("forwards the trimmed search term and status filter to the repository", async () => {
      grantOnly(["team.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, {
        page: 2,
        pageSize: 10,
        search: "  production  ",
        status: TeamActivityFilter.INACTIVE,
      });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "production",
          active: false,
          page: 2,
          pageSize: 10,
        }),
      );
    });
  });

  describe("create", () => {
    it("requires team.create, checks the department, and trims the payload", async () => {
      repository.create.mockResolvedValue(makeTeam());

      await service.create(ACTOR, {
        name: "  Production Team  ",
        departmentId: "dep-1",
        description: "  Delivers production.  ",
        managerId: "user-7",
      });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.create",
        "ORGANIZATION",
      );
      expect(repository.departmentExists).toHaveBeenCalledWith("dep-1");
      expect(repository.create).toHaveBeenCalledWith({
        name: "Production Team",
        departmentId: "dep-1",
        description: "Delivers production.",
        managerId: "user-7",
      });
    });

    it("rejects without the grant", async () => {
      grantOnly();
      await expectCode(
        service.create(ACTOR, { name: "X", departmentId: "dep-1" }),
        "PERMISSION_DENIED",
      );
    });

    it("404s a missing owning department and writes nothing", async () => {
      repository.departmentExists.mockResolvedValue(false);
      await expectCode(
        service.create(ACTOR, { name: "X", departmentId: "ghost" }),
        "TEAM_DEPARTMENT_NOT_FOUND",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("maps a name conflict and a missing manager", async () => {
      repository.create.mockResolvedValueOnce("name_conflict");
      await expectCode(
        service.create(ACTOR, { name: "Dup", departmentId: "dep-1" }),
        "TEAM_NAME_CONFLICT",
      );

      repository.create.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.create(ACTOR, {
          name: "New",
          departmentId: "dep-1",
          managerId: "ghost",
        }),
        "USER_NOT_FOUND",
      );
    });
  });

  describe("update", () => {
    it("sends only the provided fields and requires team.update", async () => {
      repository.update.mockResolvedValue(makeTeam());

      await service.update(ACTOR, "team-1", { description: "  New  " });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.update",
        "ORGANIZATION",
      );
      expect(repository.update).toHaveBeenCalledWith("team-1", {
        description: "New",
      });
    });

    it("maps not-found and name conflict", async () => {
      repository.update.mockResolvedValueOnce("not_found");
      await expectCode(
        service.update(ACTOR, "team-1", { name: "A" }),
        "TEAM_NOT_FOUND",
      );
      repository.update.mockResolvedValueOnce("name_conflict");
      await expectCode(
        service.update(ACTOR, "team-1", { name: "A" }),
        "TEAM_NAME_CONFLICT",
      );
    });
  });

  describe("manager assignment", () => {
    it("sets and clears the manager under team.assign_manager", async () => {
      repository.setManager.mockResolvedValue(makeTeam());

      await service.setManager(ACTOR, "team-1", "user-3");
      await service.setManager(ACTOR, "team-1", null);

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.assign_manager",
        "ORGANIZATION",
      );
      expect(repository.setManager).toHaveBeenNthCalledWith(
        1,
        "team-1",
        "user-3",
      );
      expect(repository.setManager).toHaveBeenNthCalledWith(2, "team-1", null);
    });

    it("maps a missing team and a missing manager user", async () => {
      repository.setManager.mockResolvedValueOnce("not_found");
      await expectCode(
        service.setManager(ACTOR, "team-1", "user-3"),
        "TEAM_NOT_FOUND",
      );
      repository.setManager.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "team-1", "ghost"),
        "USER_NOT_FOUND",
      );
    });
  });

  describe("deactivate and reactivate", () => {
    it("deactivates an active team", async () => {
      repository.findById.mockResolvedValue(makeTeam());
      repository.setDeactivated.mockResolvedValue(
        makeTeam({ deactivatedAt: new Date("2026-02-01T00:00:00.000Z") }),
      );

      const result = await service.deactivate(ACTOR, "team-1");

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.update",
        "ORGANIZATION",
      );
      expect(repository.setDeactivated).toHaveBeenCalledWith(
        "team-1",
        expect.any(Date),
      );
      expect(result.deactivatedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("rejects deactivating one that is already inactive", async () => {
      repository.findById.mockResolvedValue(
        makeTeam({ deactivatedAt: new Date() }),
      );
      await expectCode(
        service.deactivate(ACTOR, "team-1"),
        "TEAM_ALREADY_INACTIVE",
      );
      expect(repository.setDeactivated).not.toHaveBeenCalled();
    });

    it("reactivates an inactive team and rejects an active one", async () => {
      repository.findById.mockResolvedValueOnce(
        makeTeam({ deactivatedAt: new Date() }),
      );
      repository.setDeactivated.mockResolvedValue(makeTeam());
      await expect(service.reactivate(ACTOR, "team-1")).resolves.toMatchObject({
        deactivatedAt: null,
      });

      repository.findById.mockResolvedValueOnce(makeTeam());
      await expectCode(
        service.reactivate(ACTOR, "team-1"),
        "TEAM_ALREADY_ACTIVE",
      );
    });

    it("404s a deactivate for a missing team", async () => {
      repository.findById.mockResolvedValue(null);
      await expectCode(service.deactivate(ACTOR, "ghost"), "TEAM_NOT_FOUND");
    });
  });

  describe("remove", () => {
    it("removes an empty team under team.delete", async () => {
      repository.deleteIfEmpty.mockResolvedValue("deleted");
      await expect(service.remove(ACTOR, "team-1")).resolves.toBeUndefined();
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.delete",
        "ORGANIZATION",
      );
    });

    it("maps not-found and in-use", async () => {
      repository.deleteIfEmpty.mockResolvedValueOnce("not_found");
      await expectCode(service.remove(ACTOR, "team-1"), "TEAM_NOT_FOUND");
      repository.deleteIfEmpty.mockResolvedValueOnce("in_use");
      await expectCode(service.remove(ACTOR, "team-1"), "TEAM_IN_USE");
    });
  });

  describe("membership", () => {
    it("adds and removes members under team.manage_members", async () => {
      repository.addMember.mockResolvedValue(
        makeTeam({
          members: [
            {
              id: "user-2",
              email: "m@x.test",
              firstName: null,
              lastName: null,
            },
          ],
        }),
      );
      repository.removeMember.mockResolvedValue(makeTeam({ members: [] }));

      await expect(
        service.addMember(ACTOR, "team-1", "user-2"),
      ).resolves.toMatchObject({ members: [{ id: "user-2" }] });
      await expect(
        service.removeMember(ACTOR, "team-1", "user-2"),
      ).resolves.toMatchObject({ members: [] });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "team.manage_members",
        "ORGANIZATION",
      );
    });

    it("maps missing team, missing user, and non-membership", async () => {
      repository.addMember.mockResolvedValueOnce("team_not_found");
      await expectCode(
        service.addMember(ACTOR, "team-1", "user-2"),
        "TEAM_NOT_FOUND",
      );
      repository.addMember.mockResolvedValueOnce("user_not_found");
      await expectCode(
        service.addMember(ACTOR, "team-1", "ghost"),
        "USER_NOT_FOUND",
      );
      repository.removeMember.mockResolvedValueOnce("not_a_member");
      await expectCode(
        service.removeMember(ACTOR, "team-1", "user-2"),
        "USER_NOT_IN_TEAM",
      );
    });
  });

  it("maps a persistence record to the public shape", async () => {
    grantOnly(["team.read", "ORGANIZATION"]);
    repository.findById.mockResolvedValue(
      makeTeam({
        manager: {
          id: "user-9",
          email: "m@example.com",
          firstName: "Morgan",
          lastName: null,
        },
        members: [
          {
            id: "user-2",
            email: "robin@example.com",
            firstName: "Robin",
            lastName: "Doer",
          },
        ],
      }),
    );

    const result = await service.get(ACTOR, "team-1");

    expect(result).toEqual({
      id: "team-1",
      name: "Production Team",
      description: "Delivers production.",
      department: { id: "dep-1", name: "Production" },
      manager: {
        id: "user-9",
        email: "m@example.com",
        firstName: "Morgan",
        lastName: null,
      },
      members: [
        {
          id: "user-2",
          email: "robin@example.com",
          firstName: "Robin",
          lastName: "Doer",
        },
      ],
      deactivatedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});
