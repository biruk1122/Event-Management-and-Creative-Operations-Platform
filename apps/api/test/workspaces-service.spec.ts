import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { WorkspaceRecord } from "../src/workspaces/infrastructure/workspaces.repository.js";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";

const ACTOR = "actor-1";

function makeWorkspace(
  overrides: Partial<WorkspaceRecord> = {},
): WorkspaceRecord {
  return {
    id: "ws-1",
    kind: "EVENT",
    manager: null,
    teams: [],
    participants: [],
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

describe("WorkspacesService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    userExists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    setManager: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    assignTeam: ReturnType<typeof vi.fn>;
    unassignTeam: ReturnType<typeof vi.fn>;
    addParticipant: ReturnType<typeof vi.fn>;
    removeParticipant: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: WorkspacesService;

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeWorkspace()),
      userExists: vi.fn().mockResolvedValue(true),
      create: vi.fn(),
      setManager: vi.fn(),
      delete: vi.fn(),
      assignTeam: vi.fn(),
      unassignTeam: vi.fn(),
      addParticipant: vi.fn(),
      removeParticipant: vi.fn(),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new WorkspacesService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("authorization is by the owning module's key, chosen by kind", () => {
    it("uses event.* keys for an EVENT workspace", async () => {
      repository.findById.mockResolvedValue(makeWorkspace({ kind: "EVENT" }));
      grantOnly(["event.read", "ORGANIZATION"]);

      await expect(service.get(ACTOR, "ws-1")).resolves.toMatchObject({
        kind: "EVENT",
      });
      await expectCode(
        service.setManager(ACTOR, "ws-1", null),
        "PERMISSION_DENIED",
      );

      grantOnly(["event.assign_manager", "ORGANIZATION"]);
      repository.setManager.mockResolvedValue(makeWorkspace());
      await expect(
        service.setManager(ACTOR, "ws-1", null),
      ).resolves.toBeDefined();
    });

    it("uses project.* keys for both PROJECT and PRODUCTION", async () => {
      for (const kind of ["PROJECT", "PRODUCTION"] as const) {
        repository.findById.mockResolvedValue(makeWorkspace({ kind }));
        grantOnly(["project.read", "ORGANIZATION"]);
        await expect(service.get(ACTOR, "ws-1")).resolves.toMatchObject({
          kind,
        });

        grantOnly(["project.assign", "ORGANIZATION"]);
        repository.assignTeam.mockResolvedValue(makeWorkspace({ kind }));
        await expect(
          service.assignTeam(ACTOR, "ws-1", "team-1"),
        ).resolves.toBeDefined();
      }
    });

    it("uses campaign.* keys for a CAMPAIGN workspace", async () => {
      repository.findById.mockResolvedValue(
        makeWorkspace({ kind: "CAMPAIGN" }),
      );
      grantOnly(["campaign.assign", "ORGANIZATION"]);
      repository.addParticipant.mockResolvedValue(
        makeWorkspace({ kind: "CAMPAIGN" }),
      );
      await expect(
        service.addParticipant(ACTOR, "ws-1", "user-1"),
      ).resolves.toBeDefined();
    });

    it("requires event.create to create an EVENT workspace", async () => {
      grantOnly();
      await expectCode(
        service.create(ACTOR, { kind: "EVENT" }),
        "PERMISSION_DENIED",
      );

      grantOnly(["event.create", "ORGANIZATION"]);
      repository.create.mockResolvedValue(makeWorkspace());
      await expect(
        service.create(ACTOR, { kind: "EVENT" }),
      ).resolves.toMatchObject({ kind: "EVENT" });
    });

    it("requires event.delete to remove an EVENT workspace", async () => {
      grantOnly(
        ["event.read", "ORGANIZATION"],
        ["event.assign_teams", "ORGANIZATION"],
      );
      await expectCode(service.remove(ACTOR, "ws-1"), "PERMISSION_DENIED");

      grantOnly(["event.delete", "ORGANIZATION"]);
      repository.delete.mockResolvedValue("deleted");
      await expect(service.remove(ACTOR, "ws-1")).resolves.toBeUndefined();
    });

    it("only ever checks grants at ORGANIZATION scope", async () => {
      grantOnly(["event.read", "DEPARTMENT"]);
      await expectCode(service.get(ACTOR, "ws-1"), "PERMISSION_DENIED");
    });
  });

  describe("not-found precedes authorization for :id routes", () => {
    it("404s a missing workspace before any grant check", async () => {
      repository.findById.mockResolvedValue(null);
      grantOnly();
      await expectCode(service.get(ACTOR, "missing"), "WORKSPACE_NOT_FOUND");
      await expectCode(
        service.setManager(ACTOR, "missing", null),
        "WORKSPACE_NOT_FOUND",
      );
      expect(permissions.hasGrant).not.toHaveBeenCalled();
    });
  });

  describe("repository outcome mapping", () => {
    beforeEach(() => {
      grantOnly(
        ["event.read", "ORGANIZATION"],
        ["event.create", "ORGANIZATION"],
        ["event.assign_manager", "ORGANIZATION"],
        ["event.assign_teams", "ORGANIZATION"],
      );
    });

    it("maps a missing manager to USER_NOT_FOUND on create and setManager", async () => {
      repository.create.mockResolvedValue("manager_not_found");
      await expectCode(
        service.create(ACTOR, { kind: "EVENT", managerId: "ghost" }),
        "USER_NOT_FOUND",
      );

      repository.setManager.mockResolvedValue("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "ws-1", "ghost"),
        "USER_NOT_FOUND",
      );
    });

    it("maps team assignment outcomes", async () => {
      repository.assignTeam.mockResolvedValue("team_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "ws-1", "ghost"),
        "WORKSPACE_TEAM_NOT_FOUND",
      );

      repository.unassignTeam.mockResolvedValue("not_assigned");
      await expectCode(
        service.unassignTeam(ACTOR, "ws-1", "team-1"),
        "WORKSPACE_TEAM_NOT_ASSIGNED",
      );
    });

    it("maps participant outcomes", async () => {
      repository.addParticipant.mockResolvedValue("user_not_found");
      await expectCode(
        service.addParticipant(ACTOR, "ws-1", "ghost"),
        "USER_NOT_FOUND",
      );

      repository.removeParticipant.mockResolvedValue("not_a_participant");
      await expectCode(
        service.removeParticipant(ACTOR, "ws-1", "user-1"),
        "WORKSPACE_PARTICIPANT_NOT_FOUND",
      );
    });
  });

  describe("response contract", () => {
    it("returns ISO timestamp strings and no extra keys", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeWorkspace({
          manager: {
            id: "u1",
            email: "a@b.c",
            firstName: "A",
            lastName: "B",
          },
          teams: [{ id: "t1", name: "Team" }],
          participants: [
            { id: "u2", email: "c@d.e", firstName: null, lastName: null },
          ],
        }),
      );

      const response = await service.get(ACTOR, "ws-1");

      expect(Object.keys(response).sort()).toEqual(
        [
          "createdAt",
          "id",
          "kind",
          "manager",
          "participants",
          "teams",
          "updatedAt",
        ].sort(),
      );
      expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(response.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    });
  });
});
