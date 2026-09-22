import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { ProjectRecord } from "../src/projects/infrastructure/projects.repository.js";
import { ProjectsService } from "../src/projects/projects.service.js";

const ACTOR = "actor-1";

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "prj-1",
    workspaceId: "ws-1",
    name: "Launch",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
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

describe("ProjectsService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let workspaces: {
    setManager: ReturnType<typeof vi.fn>;
    assignTeam: ReturnType<typeof vi.fn>;
    unassignTeam: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: ProjectsService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeProject()),
      create: vi.fn().mockResolvedValue(makeProject()),
      update: vi.fn().mockResolvedValue(makeProject()),
      updateStatus: vi.fn().mockResolvedValue(makeProject()),
      delete: vi.fn().mockResolvedValue("deleted"),
    };
    workspaces = {
      setManager: vi.fn().mockResolvedValue({}),
      assignTeam: vi.fn().mockResolvedValue({}),
      unassignTeam: vi.fn().mockResolvedValue({}),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new ProjectsService(
      repository as never,
      workspaces as never,
      permissions as never,
    );
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("authorization is by the exact project key at ORGANIZATION scope", () => {
    it.each([
      [
        "list",
        (s: ProjectsService) => s.list(ACTOR, { page: 1, pageSize: 25 }),
      ],
      ["get", (s: ProjectsService) => s.get(ACTOR, "prj-1")],
      ["create", (s: ProjectsService) => s.create(ACTOR, { name: "x" })],
      ["update", (s: ProjectsService) => s.update(ACTOR, "prj-1", {})],
      [
        "transition",
        (s: ProjectsService) => s.transition(ACTOR, "prj-1", "ACTIVE"),
      ],
      [
        "setManager",
        (s: ProjectsService) => s.setManager(ACTOR, "prj-1", null),
      ],
      [
        "assignTeam",
        (s: ProjectsService) => s.assignTeam(ACTOR, "prj-1", "team-1"),
      ],
      [
        "unassignTeam",
        (s: ProjectsService) => s.unassignTeam(ACTOR, "prj-1", "team-1"),
      ],
      ["remove", (s: ProjectsService) => s.remove(ACTOR, "prj-1")],
    ] as const)("%s is denied without a grant", async (_label, call) => {
      grantOnly();
      await expectCode(call(service), "PERMISSION_DENIED");
    });

    it.each([
      ["project.read", "DEPARTMENT"],
      ["project.read", "SELF"],
    ] as const)(
      "read is denied for an %s grant at %s scope",
      async (key, scope) => {
        grantOnly([key, scope]);
        await expectCode(
          service.list(ACTOR, { page: 1, pageSize: 25 }),
          "PERMISSION_DENIED",
        );
      },
    );

    it("each write path checks its own key", async () => {
      const table: [string, () => Promise<unknown>][] = [
        ["project.create", () => service.create(ACTOR, { name: "x" })],
        ["project.update", () => service.update(ACTOR, "prj-1", {})],
        [
          "project.transition_status",
          () => service.transition(ACTOR, "prj-1", "ACTIVE"),
        ],
        ["project.assign", () => service.setManager(ACTOR, "prj-1", null)],
        ["project.assign", () => service.assignTeam(ACTOR, "prj-1", "t")],
        ["project.assign", () => service.unassignTeam(ACTOR, "prj-1", "t")],
        ["project.delete", () => service.remove(ACTOR, "prj-1")],
      ];
      for (const [key, call] of table) {
        grantOnly([key, "ORGANIZATION"]);
        await expect(call()).resolves.not.toThrow();
        expect(permissions.hasGrant).toHaveBeenCalledWith(
          ACTOR,
          key,
          "ORGANIZATION",
        );
      }
    });
  });

  describe("not-found precedes authorization on :id routes", () => {
    it.each([
      ["get", (s: ProjectsService) => s.get(ACTOR, "missing")],
      ["update", (s: ProjectsService) => s.update(ACTOR, "missing", {})],
      [
        "transition",
        (s: ProjectsService) => s.transition(ACTOR, "missing", "ACTIVE"),
      ],
      [
        "setManager",
        (s: ProjectsService) => s.setManager(ACTOR, "missing", null),
      ],
      [
        "assignTeam",
        (s: ProjectsService) => s.assignTeam(ACTOR, "missing", "t"),
      ],
      [
        "unassignTeam",
        (s: ProjectsService) => s.unassignTeam(ACTOR, "missing", "t"),
      ],
      ["remove", (s: ProjectsService) => s.remove(ACTOR, "missing")],
    ] as const)("%s 404s before any grant check", async (_label, call) => {
      repository.findById.mockResolvedValue(null);
      grantOnly();
      await expectCode(call(service), "PROJECT_NOT_FOUND");
      expect(permissions.hasGrant).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle transitions follow the approved graph", () => {
    it.each([
      ["PLANNED", "ACTIVE", true],
      ["PLANNED", "CANCELLED", true],
      ["PLANNED", "COMPLETED", false],
      ["PLANNED", "PLANNED", false],
      ["ACTIVE", "COMPLETED", true],
      ["ACTIVE", "CANCELLED", true],
      ["ACTIVE", "PLANNED", false],
      ["COMPLETED", "ACTIVE", false],
      ["CANCELLED", "PLANNED", false],
    ] as const)("%s -> %s allowed=%s", async (from, to, allowed) => {
      repository.findById.mockResolvedValue(makeProject({ status: from }));
      repository.updateStatus.mockResolvedValue(makeProject({ status: to }));
      grantOnly(["project.transition_status", "ORGANIZATION"]);

      if (allowed) {
        await expect(
          service.transition(ACTOR, "prj-1", to),
        ).resolves.toMatchObject({ status: to });
        expect(repository.updateStatus).toHaveBeenCalledWith("prj-1", from, to);
      } else {
        await expectCode(
          service.transition(ACTOR, "prj-1", to),
          "PROJECT_INVALID_TRANSITION",
        );
        expect(repository.updateStatus).not.toHaveBeenCalled();
      }
    });

    it("409s with the status it now has when another request moved it first", async () => {
      grantOnly(["project.transition_status", "ORGANIZATION"]);
      repository.findById
        .mockResolvedValueOnce(makeProject({ status: "PLANNED" }))
        .mockResolvedValueOnce(makeProject({ status: "CANCELLED" }));
      repository.updateStatus.mockResolvedValueOnce("status_changed");

      const promise = service.transition(ACTOR, "prj-1", "ACTIVE");

      await expectCode(promise, "PROJECT_INVALID_TRANSITION");
      await promise.catch((error: unknown) => {
        const detail = (error as HttpException).getResponse() as {
          detail: string;
        };
        expect(detail.detail).toBe(
          "A project in CANCELLED cannot move to ACTIVE.",
        );
      });
    });

    it("404s when the project is deleted while the transition races", async () => {
      grantOnly(["project.transition_status", "ORGANIZATION"]);
      repository.updateStatus.mockResolvedValueOnce("status_changed");
      repository.findById
        .mockResolvedValueOnce(makeProject())
        .mockResolvedValueOnce(null);

      await expectCode(
        service.transition(ACTOR, "prj-1", "ACTIVE"),
        "PROJECT_NOT_FOUND",
      );
    });

    it("404s when the project disappears between load and update", async () => {
      grantOnly(["project.transition_status", "ORGANIZATION"]);
      repository.updateStatus.mockResolvedValueOnce("not_found");
      await expectCode(
        service.transition(ACTOR, "prj-1", "ACTIVE"),
        "PROJECT_NOT_FOUND",
      );
    });
  });

  describe("schedule ordering", () => {
    beforeEach(() => {
      grantOnly(
        ["project.create", "ORGANIZATION"],
        ["project.update", "ORGANIZATION"],
      );
    });

    it("rejects create with an end before the start", async () => {
      await expectCode(
        service.create(ACTOR, {
          name: "x",
          startAt: "2026-05-02T10:00:00.000Z",
          endAt: "2026-05-01T10:00:00.000Z",
        }),
        "PROJECT_SCHEDULE_INVALID",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("allows create with an end at or after the start", async () => {
      await expect(
        service.create(ACTOR, {
          name: "x",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T10:00:00.000Z",
        }),
      ).resolves.toBeDefined();
    });

    it("rejects a patch whose new end falls before the existing start", async () => {
      repository.findById.mockResolvedValue(
        makeProject({ startAt: new Date("2026-05-10T00:00:00.000Z") }),
      );
      await expectCode(
        service.update(ACTOR, "prj-1", { endAt: "2026-05-01T00:00:00.000Z" }),
        "PROJECT_SCHEDULE_INVALID",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("allows a patch that clears the start", async () => {
      repository.findById.mockResolvedValue(
        makeProject({
          startAt: new Date("2026-05-10T00:00:00.000Z"),
          endAt: new Date("2026-05-11T00:00:00.000Z"),
        }),
      );
      await expect(
        service.update(ACTOR, "prj-1", { startAt: null }),
      ).resolves.toBeDefined();
    });
  });

  describe("repository outcome mapping", () => {
    it("maps a missing manager to USER_NOT_FOUND on create", async () => {
      grantOnly(["project.create", "ORGANIZATION"]);
      repository.create.mockResolvedValue("manager_not_found");
      await expectCode(
        service.create(ACTOR, { name: "x", managerId: "ghost" }),
        "USER_NOT_FOUND",
      );
    });

    it("maps a missing related event to EVENT_NOT_FOUND on create", async () => {
      grantOnly(["project.create", "ORGANIZATION"]);
      repository.create.mockResolvedValue("event_not_found");
      await expectCode(
        service.create(ACTOR, { name: "x", eventId: "ghost" }),
        "EVENT_NOT_FOUND",
      );
    });

    it("maps a missing related event to EVENT_NOT_FOUND on update", async () => {
      grantOnly(["project.update", "ORGANIZATION"]);
      repository.update.mockResolvedValue("event_not_found");
      await expectCode(
        service.update(ACTOR, "prj-1", { eventId: "ghost" }),
        "EVENT_NOT_FOUND",
      );
    });

    it("maps setManager outcomes through the workspace repository", async () => {
      grantOnly(["project.assign", "ORGANIZATION"]);

      workspaces.setManager.mockResolvedValue("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "prj-1", "ghost"),
        "USER_NOT_FOUND",
      );

      workspaces.setManager.mockResolvedValue("not_found");
      await expectCode(
        service.setManager(ACTOR, "prj-1", null),
        "PROJECT_NOT_FOUND",
      );
    });

    it("maps team assignment outcomes", async () => {
      grantOnly(["project.assign", "ORGANIZATION"]);

      workspaces.assignTeam.mockResolvedValue("team_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "prj-1", "ghost"),
        "PROJECT_TEAM_NOT_FOUND",
      );

      workspaces.unassignTeam.mockResolvedValue("not_assigned");
      await expectCode(
        service.unassignTeam(ACTOR, "prj-1", "team-1"),
        "PROJECT_TEAM_NOT_ASSIGNED",
      );

      workspaces.assignTeam.mockResolvedValue("workspace_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "prj-1", "team-1"),
        "PROJECT_NOT_FOUND",
      );
    });

    it("maps a raced update/delete to PROJECT_NOT_FOUND", async () => {
      grantOnly(
        ["project.update", "ORGANIZATION"],
        ["project.delete", "ORGANIZATION"],
        ["project.transition_status", "ORGANIZATION"],
      );
      repository.update.mockResolvedValue("not_found");
      await expectCode(service.update(ACTOR, "prj-1", {}), "PROJECT_NOT_FOUND");

      repository.updateStatus.mockResolvedValue("not_found");
      await expectCode(
        service.transition(ACTOR, "prj-1", "ACTIVE"),
        "PROJECT_NOT_FOUND",
      );

      repository.delete.mockResolvedValue("not_found");
      await expectCode(service.remove(ACTOR, "prj-1"), "PROJECT_NOT_FOUND");
    });

    it("maps a delete blocked by managed files to PROJECT_HAS_MANAGED_FILES", async () => {
      grantOnly(["project.delete", "ORGANIZATION"]);
      repository.delete.mockResolvedValue("has_managed_files");
      await expectCode(
        service.remove(ACTOR, "prj-1"),
        "PROJECT_HAS_MANAGED_FILES",
      );
    });
  });

  describe("response contract", () => {
    it("returns ISO strings and embeds workspace composition", async () => {
      grantOnly(["project.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeProject({
          startAt: new Date("2026-03-01T09:00:00.000Z"),
          endAt: new Date("2026-03-01T17:00:00.000Z"),
          eventId: "evt-1",
          manager: { id: "u1", email: "a@b.c", firstName: "A", lastName: "B" },
          teams: [{ id: "t1", name: "Crew" }],
          participants: [
            { id: "u2", email: "c@d.e", firstName: null, lastName: null },
          ],
        }),
      );

      const response = await service.get(ACTOR, "prj-1");

      expect(Object.keys(response).sort()).toEqual(
        [
          "createdAt",
          "createdBy",
          "description",
          "endAt",
          "eventId",
          "id",
          "manager",
          "name",
          "participants",
          "startAt",
          "status",
          "teams",
          "updatedAt",
          "workspaceId",
        ].sort(),
      );
      expect(response.startAt).toBe("2026-03-01T09:00:00.000Z");
      expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(response.teams).toEqual([{ id: "t1", name: "Crew" }]);
      expect(response.eventId).toBe("evt-1");
    });
  });
});
