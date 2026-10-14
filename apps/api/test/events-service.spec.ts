import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { EventRecord } from "../src/events/infrastructure/events.repository.js";
import { EventsService } from "../src/events/events.service.js";

const ACTOR = "actor-1";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "evt-1",
    workspaceId: "ws-1",
    name: "Launch",
    eventType: "CONCERT",
    description: null,
    status: "PLANNING",
    startAt: null,
    endAt: null,
    location: null,
    organizerName: null,
    departmentId: null,
    budgetAmount: null,
    budgetCurrency: null,
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

describe("EventsService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findVisibleById: ReturnType<
      typeof vi.fn<(id: string) => Promise<EventRecord | null>>
    >;
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    budgetSummary: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    setBudget: ReturnType<typeof vi.fn>;
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
  let service: EventsService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeEvent()),
      // Mirrors `findById` for every test that only ever drives
      // `findById.mockResolvedValue(...)` - visibility filtering itself is
      // covered by the dedicated department-scoping tests below.
      findVisibleById: vi.fn(),
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
      budgetSummary: vi.fn().mockResolvedValue({
        plannedAmount: null,
        currency: null,
        actualApproved: "0.00",
        actualPending: "0.00",
      }),
      create: vi.fn().mockResolvedValue(makeEvent()),
      update: vi.fn().mockResolvedValue(makeEvent()),
      updateStatus: vi.fn().mockResolvedValue(makeEvent()),
      setBudget: vi.fn().mockResolvedValue(makeEvent()),
      delete: vi.fn().mockResolvedValue("deleted"),
    };
    function forwardToFindById(id: string): Promise<EventRecord | null> {
      return (
        repository.findById as (id: string) => Promise<EventRecord | null>
      )(id);
    }
    repository.findVisibleById.mockImplementation(forwardToFindById);
    workspaces = {
      setManager: vi.fn().mockResolvedValue({}),
      assignTeam: vi.fn().mockResolvedValue({}),
      unassignTeam: vi.fn().mockResolvedValue({}),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new EventsService(
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

  describe("authorization is by the exact event key at ORGANIZATION scope", () => {
    it.each([
      ["list", (s: EventsService) => s.list(ACTOR, { page: 1, pageSize: 25 })],
      ["get", (s: EventsService) => s.get(ACTOR, "evt-1")],
      [
        "create",
        (s: EventsService) =>
          s.create(ACTOR, { name: "x", eventType: "CONCERT" }),
      ],
      ["update", (s: EventsService) => s.update(ACTOR, "evt-1", {})],
      [
        "transition",
        (s: EventsService) => s.transition(ACTOR, "evt-1", "READY"),
      ],
      ["setManager", (s: EventsService) => s.setManager(ACTOR, "evt-1", null)],
      [
        "assignTeam",
        (s: EventsService) => s.assignTeam(ACTOR, "evt-1", "team-1"),
      ],
      [
        "unassignTeam",
        (s: EventsService) => s.unassignTeam(ACTOR, "evt-1", "team-1"),
      ],
      ["getBudget", (s: EventsService) => s.getBudget(ACTOR, "evt-1")],
      [
        "setBudget",
        (s: EventsService) =>
          s.setBudget(ACTOR, "evt-1", { amount: null, currency: null }),
      ],
      ["remove", (s: EventsService) => s.remove(ACTOR, "evt-1")],
    ] as const)("%s is denied without a grant", async (_label, call) => {
      grantOnly();
      await expectCode(call(service), "PERMISSION_DENIED");
    });

    it("read is denied for an event.read grant at SELF scope (Events never grant SELF)", async () => {
      grantOnly(["event.read", "SELF"]);
      await expectCode(
        service.list(ACTOR, { page: 1, pageSize: 25 }),
        "PERMISSION_DENIED",
      );
    });

    it("read succeeds, department-scoped, for an event.read grant at DEPARTMENT scope (EOM-01)", async () => {
      grantOnly(["event.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dept-1");
      await expect(
        service.list(ACTOR, { page: 1, pageSize: 25 }),
      ).resolves.toBeDefined();
      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: { organization: false, departmentId: "dept-1" },
        }),
      );
    });

    it("each write path checks its own key", async () => {
      const table: [string, () => Promise<unknown>][] = [
        [
          "event.create",
          () => service.create(ACTOR, { name: "x", eventType: "CONCERT" }),
        ],
        ["event.update", () => service.update(ACTOR, "evt-1", {})],
        [
          "event.transition_status",
          () => service.transition(ACTOR, "evt-1", "READY"),
        ],
        [
          "event.assign_manager",
          () => service.setManager(ACTOR, "evt-1", null),
        ],
        ["event.assign_teams", () => service.assignTeam(ACTOR, "evt-1", "t")],
        ["event.budget.read", () => service.getBudget(ACTOR, "evt-1")],
        [
          "event.budget.update",
          () =>
            service.setBudget(ACTOR, "evt-1", { amount: null, currency: null }),
        ],
        ["event.delete", () => service.remove(ACTOR, "evt-1")],
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

  describe("visibility is resolved before an :id route's own lookup", () => {
    // EOM-01: unlike the pre-retrofit behavior, visibility (and so a grant
    // check) must be resolved before the record lookup, since the lookup
    // itself is filtered by that visibility. An organization-scoped caller
    // still gets a real 404 for an unknown id; a department-scoped caller
    // gets the same denial for an absent id and an out-of-department id, so
    // ids cannot be used to probe events outside their own department.
    it.each([
      ["get", "event.read", (s: EventsService) => s.get(ACTOR, "missing")],
      [
        "update",
        "event.update",
        (s: EventsService) => s.update(ACTOR, "missing", {}),
      ],
      [
        "transition",
        "event.transition_status",
        (s: EventsService) => s.transition(ACTOR, "missing", "READY"),
      ],
      [
        "setManager",
        "event.assign_manager",
        (s: EventsService) => s.setManager(ACTOR, "missing", null),
      ],
      [
        "assignTeam",
        "event.assign_teams",
        (s: EventsService) => s.assignTeam(ACTOR, "missing", "t"),
      ],
      [
        "unassignTeam",
        "event.assign_teams",
        (s: EventsService) => s.unassignTeam(ACTOR, "missing", "t"),
      ],
      [
        "getBudget",
        "event.budget.read",
        (s: EventsService) => s.getBudget(ACTOR, "missing"),
      ],
      [
        "setBudget",
        "event.budget.update",
        (s: EventsService) =>
          s.setBudget(ACTOR, "missing", { amount: null, currency: null }),
      ],
      [
        "remove",
        "event.delete",
        (s: EventsService) => s.remove(ACTOR, "missing"),
      ],
    ] as const)(
      "%s 404s for an organization-scoped caller on an unknown id",
      async (_label, key, call) => {
        repository.findById.mockResolvedValue(null);
        grantOnly([key, "ORGANIZATION"]);
        await expectCode(call(service), "EVENT_NOT_FOUND");
      },
    );

    it("get is denied, not 404, for a department-scoped caller on an unknown id", async () => {
      repository.findById.mockResolvedValue(null);
      grantOnly(["event.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dept-1");
      await expectCode(service.get(ACTOR, "missing"), "PERMISSION_DENIED");
    });

    it("get is denied for a department-scoped caller on another department's event", async () => {
      repository.findVisibleById.mockResolvedValue(null);
      repository.findById.mockResolvedValue(
        makeEvent({ departmentId: "dept-other" }),
      );
      grantOnly(["event.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dept-1");
      await expectCode(service.get(ACTOR, "evt-1"), "PERMISSION_DENIED");
    });

    it("get succeeds for a department-scoped caller on their own department's event", async () => {
      repository.findById.mockResolvedValue(
        makeEvent({ departmentId: "dept-1" }),
      );
      grantOnly(["event.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dept-1");
      await expect(service.get(ACTOR, "evt-1")).resolves.toBeDefined();
    });
  });

  describe("lifecycle transitions follow the approved graph", () => {
    it.each([
      ["PLANNING", "READY", true],
      ["PLANNING", "IN_PROGRESS", true],
      ["PLANNING", "CANCELLED", true],
      ["PLANNING", "COMPLETED", false],
      ["PLANNING", "PLANNING", false],
      ["READY", "IN_PROGRESS", true],
      ["READY", "COMPLETED", false],
      ["IN_PROGRESS", "COMPLETED", true],
      ["IN_PROGRESS", "READY", false],
      ["COMPLETED", "IN_PROGRESS", false],
      ["CANCELLED", "PLANNING", false],
    ] as const)("%s -> %s allowed=%s", async (from, to, allowed) => {
      repository.findById.mockResolvedValue(makeEvent({ status: from }));
      repository.updateStatus.mockResolvedValue(makeEvent({ status: to }));
      grantOnly(["event.transition_status", "ORGANIZATION"]);

      if (allowed) {
        await expect(
          service.transition(ACTOR, "evt-1", to),
        ).resolves.toMatchObject({ status: to });
        expect(repository.updateStatus).toHaveBeenCalledWith("evt-1", from, to);
      } else {
        await expectCode(
          service.transition(ACTOR, "evt-1", to),
          "EVENT_INVALID_TRANSITION",
        );
        expect(repository.updateStatus).not.toHaveBeenCalled();
      }
    });

    it("409s with the status it now has when another request moved it first", async () => {
      grantOnly(["event.transition_status", "ORGANIZATION"]);
      repository.findById
        .mockResolvedValueOnce(makeEvent({ status: "PLANNING" }))
        .mockResolvedValueOnce(makeEvent({ status: "CANCELLED" }));
      repository.updateStatus.mockResolvedValueOnce("status_changed");

      const promise = service.transition(ACTOR, "evt-1", "READY");

      await expectCode(promise, "EVENT_INVALID_TRANSITION");
      await promise.catch((error: unknown) => {
        const detail = (error as HttpException).getResponse() as {
          detail: string;
        };
        expect(detail.detail).toBe(
          "An event in CANCELLED cannot move to READY.",
        );
      });
    });

    it("404s when the event is deleted while the transition races", async () => {
      grantOnly(["event.transition_status", "ORGANIZATION"]);
      repository.updateStatus.mockResolvedValueOnce("status_changed");
      repository.findById
        .mockResolvedValueOnce(makeEvent())
        .mockResolvedValueOnce(null);

      await expectCode(
        service.transition(ACTOR, "evt-1", "READY"),
        "EVENT_NOT_FOUND",
      );
    });

    it("404s when the event disappears between load and update", async () => {
      grantOnly(["event.transition_status", "ORGANIZATION"]);
      repository.updateStatus.mockResolvedValueOnce("not_found");
      await expectCode(
        service.transition(ACTOR, "evt-1", "READY"),
        "EVENT_NOT_FOUND",
      );
    });
  });

  describe("schedule ordering", () => {
    beforeEach(() => {
      grantOnly(
        ["event.create", "ORGANIZATION"],
        ["event.update", "ORGANIZATION"],
      );
    });

    it("rejects create with an end before the start", async () => {
      await expectCode(
        service.create(ACTOR, {
          name: "x",
          eventType: "CONCERT",
          startAt: "2026-05-02T10:00:00.000Z",
          endAt: "2026-05-01T10:00:00.000Z",
        }),
        "EVENT_SCHEDULE_INVALID",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("allows create with an end at or after the start", async () => {
      await expect(
        service.create(ACTOR, {
          name: "x",
          eventType: "CONCERT",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T10:00:00.000Z",
        }),
      ).resolves.toBeDefined();
    });

    it("rejects a patch whose new end falls before the existing start", async () => {
      repository.findById.mockResolvedValue(
        makeEvent({ startAt: new Date("2026-05-10T00:00:00.000Z") }),
      );
      await expectCode(
        service.update(ACTOR, "evt-1", { endAt: "2026-05-01T00:00:00.000Z" }),
        "EVENT_SCHEDULE_INVALID",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("allows a patch that clears the start", async () => {
      repository.findById.mockResolvedValue(
        makeEvent({
          startAt: new Date("2026-05-10T00:00:00.000Z"),
          endAt: new Date("2026-05-11T00:00:00.000Z"),
        }),
      );
      await expect(
        service.update(ACTOR, "evt-1", { startAt: null }),
      ).resolves.toBeDefined();
    });
  });

  describe("budget", () => {
    beforeEach(() => {
      grantOnly(
        ["event.budget.read", "ORGANIZATION"],
        ["event.budget.update", "ORGANIZATION"],
      );
    });

    it("reads the stored amount and currency", async () => {
      repository.findById.mockResolvedValue(
        makeEvent({ budgetAmount: "1500.00", budgetCurrency: "USD" }),
      );
      await expect(service.getBudget(ACTOR, "evt-1")).resolves.toEqual({
        amount: "1500.00",
        currency: "USD",
      });
    });

    it.each([
      [{ amount: 100, currency: null }],
      [{ amount: null, currency: "USD" }],
    ] as const)("rejects a half-set budget %j", async (payload) => {
      await expectCode(
        service.setBudget(ACTOR, "evt-1", payload),
        "EVENT_BUDGET_INCOMPLETE",
      );
      expect(repository.setBudget).not.toHaveBeenCalled();
    });

    it("stores a matched pair with two fraction digits", async () => {
      repository.setBudget.mockResolvedValue(
        makeEvent({ budgetAmount: "2500.00", budgetCurrency: "EUR" }),
      );
      await expect(
        service.setBudget(ACTOR, "evt-1", { amount: 2500, currency: "EUR" }),
      ).resolves.toEqual({ amount: "2500.00", currency: "EUR" });
      expect(repository.setBudget).toHaveBeenCalledWith(
        "evt-1",
        "2500.00",
        "EUR",
      );
    });

    it("clears the budget when both are null", async () => {
      await expect(
        service.setBudget(ACTOR, "evt-1", { amount: null, currency: null }),
      ).resolves.toEqual({ amount: null, currency: null });
      expect(repository.setBudget).toHaveBeenCalledWith("evt-1", null, null);
    });
  });

  describe("repository outcome mapping", () => {
    it("maps a missing manager to USER_NOT_FOUND on create", async () => {
      grantOnly(["event.create", "ORGANIZATION"]);
      repository.create.mockResolvedValue("manager_not_found");
      await expectCode(
        service.create(ACTOR, {
          name: "x",
          eventType: "CONCERT",
          managerId: "ghost",
        }),
        "USER_NOT_FOUND",
      );
    });

    it("maps setManager outcomes through the workspace repository", async () => {
      grantOnly(["event.assign_manager", "ORGANIZATION"]);

      workspaces.setManager.mockResolvedValue("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "evt-1", "ghost"),
        "USER_NOT_FOUND",
      );

      workspaces.setManager.mockResolvedValue("not_found");
      await expectCode(
        service.setManager(ACTOR, "evt-1", null),
        "EVENT_NOT_FOUND",
      );
    });

    it("maps team assignment outcomes", async () => {
      grantOnly(["event.assign_teams", "ORGANIZATION"]);

      workspaces.assignTeam.mockResolvedValue("team_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "evt-1", "ghost"),
        "EVENT_TEAM_NOT_FOUND",
      );

      workspaces.unassignTeam.mockResolvedValue("not_assigned");
      await expectCode(
        service.unassignTeam(ACTOR, "evt-1", "team-1"),
        "EVENT_TEAM_NOT_ASSIGNED",
      );

      workspaces.assignTeam.mockResolvedValue("workspace_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "evt-1", "team-1"),
        "EVENT_NOT_FOUND",
      );
    });

    it("maps a raced update/delete to EVENT_NOT_FOUND", async () => {
      grantOnly(
        ["event.update", "ORGANIZATION"],
        ["event.delete", "ORGANIZATION"],
        ["event.transition_status", "ORGANIZATION"],
      );
      repository.update.mockResolvedValue("not_found");
      await expectCode(service.update(ACTOR, "evt-1", {}), "EVENT_NOT_FOUND");

      repository.updateStatus.mockResolvedValue("not_found");
      await expectCode(
        service.transition(ACTOR, "evt-1", "READY"),
        "EVENT_NOT_FOUND",
      );

      repository.delete.mockResolvedValue("not_found");
      await expectCode(service.remove(ACTOR, "evt-1"), "EVENT_NOT_FOUND");
    });
  });

  describe("response contract", () => {
    it("returns ISO strings, embeds workspace composition, and never a budget key", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeEvent({
          startAt: new Date("2026-03-01T09:00:00.000Z"),
          endAt: new Date("2026-03-01T17:00:00.000Z"),
          budgetAmount: "999.99",
          budgetCurrency: "USD",
          manager: { id: "u1", email: "a@b.c", firstName: "A", lastName: "B" },
          teams: [{ id: "t1", name: "Crew" }],
          participants: [
            { id: "u2", email: "c@d.e", firstName: null, lastName: null },
          ],
        }),
      );

      const response = await service.get(ACTOR, "evt-1");

      expect(Object.keys(response).sort()).toEqual(
        [
          "createdAt",
          "createdBy",
          "departmentId",
          "description",
          "endAt",
          "eventType",
          "id",
          "location",
          "manager",
          "name",
          "organizerName",
          "participants",
          "startAt",
          "status",
          "teams",
          "updatedAt",
          "workspaceId",
        ].sort(),
      );
      expect(response).not.toHaveProperty("budgetAmount");
      expect(response).not.toHaveProperty("budget");
      expect(response.startAt).toBe("2026-03-01T09:00:00.000Z");
      expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(response.teams).toEqual([{ id: "t1", name: "Crew" }]);
    });
  });
});
