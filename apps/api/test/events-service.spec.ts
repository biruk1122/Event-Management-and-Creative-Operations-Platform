import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { EventRecord } from "../src/events/infrastructure/events.repository.js";
import { EventsService } from "../src/events/events.service.js";

const ACTOR = "actor-1";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    eventNumber: 1,
    id: "evt-1",
    workspaceId: "ws-1",
    name: "Launch",
    eventType: "CONCERT",
    description: null,
    status: "PLANNING",
    startAt: null,
    endAt: null,
    reminderAt: null,
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

const talentAssignments = { archiveHook: () => () => Promise.resolve() };
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
    taskProgressFor: ReturnType<typeof vi.fn>;
    summary: ReturnType<typeof vi.fn>;
    overview: ReturnType<typeof vi.fn>;
    visibleLinkedTaskIds: ReturnType<typeof vi.fn>;
    peopleByIds: ReturnType<typeof vi.fn>;
    listMilestones: ReturnType<typeof vi.fn>;
    createMilestone: ReturnType<typeof vi.fn>;
    updateMilestone: ReturnType<typeof vi.fn>;
    deleteMilestone: ReturnType<typeof vi.fn>;
  };
  let auditWriter: { record: ReturnType<typeof vi.fn> };
  let auditReader: { listWorkActivity: ReturnType<typeof vi.fn> };
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
      taskProgressFor: vi.fn().mockResolvedValue(new Map()),
      summary: vi.fn().mockResolvedValue({
        total: 0,
        upcoming: 0,
        inProgress: 0,
        completed: 0,
      }),
      overview: vi.fn(),
      visibleLinkedTaskIds: vi.fn().mockResolvedValue([]),
      peopleByIds: vi.fn().mockResolvedValue(new Map()),
      listMilestones: vi.fn().mockResolvedValue([]),
      createMilestone: vi.fn(),
      updateMilestone: vi.fn(),
      deleteMilestone: vi.fn().mockResolvedValue("deleted"),
    };
    auditWriter = { record: vi.fn().mockResolvedValue(undefined) };
    auditReader = { listWorkActivity: vi.fn().mockResolvedValue([]) };
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
      talentAssignments as never,
      auditWriter as never,
      auditReader as never,
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
      ["remove", (s: EventsService) => s.remove(ACTOR, "evt-1", "req-1")],
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
        ["event.delete", () => service.remove(ACTOR, "evt-1", "req-1")],
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
        (s: EventsService) => s.remove(ACTOR, "missing", "req-1"),
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
        expect(repository.updateStatus).toHaveBeenCalledWith(
          "evt-1",
          from,
          to,
          expect.objectContaining({ actorUserId: ACTOR }),
        );
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
        expect.objectContaining({ actorUserId: ACTOR }),
      );
    });

    it("clears the budget when both are null", async () => {
      await expect(
        service.setBudget(ACTOR, "evt-1", { amount: null, currency: null }),
      ).resolves.toEqual({ amount: null, currency: null });
      expect(repository.setBudget).toHaveBeenCalledWith(
        "evt-1",
        null,
        null,
        expect.objectContaining({ actorUserId: ACTOR }),
      );
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
      await expectCode(
        service.remove(ACTOR, "evt-1", "req-1"),
        "EVENT_NOT_FOUND",
      );
    });
  });

  describe("create with teams, budget and status", () => {
    const TEAM_ID = "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77";
    const base = { name: "Gala", eventType: "CONCERT" as const };

    it("refuses teams without event.assign_teams", async () => {
      grantOnly(["event.create", "ORGANIZATION"]);
      await expectCode(
        service.create(ACTOR, { ...base, teamIds: [TEAM_ID] }),
        "PERMISSION_DENIED",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("refuses a budget without event.budget.update", async () => {
      grantOnly(["event.create", "ORGANIZATION"]);
      await expectCode(
        service.create(ACTOR, { ...base, budgetAmount: 100 }),
        "PERMISSION_DENIED",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("rejects a currency without an amount", async () => {
      grantOnly(
        ["event.create", "ORGANIZATION"],
        ["event.budget.update", "ORGANIZATION"],
      );
      await expectCode(
        service.create(ACTOR, { ...base, budgetCurrency: "ETB" }),
        "EVENT_BUDGET_INCOMPLETE",
      );
    });

    it("passes teams, a default ETB budget and the starting status to the repository", async () => {
      grantOnly(
        ["event.create", "ORGANIZATION"],
        ["event.assign_teams", "ORGANIZATION"],
        ["event.budget.update", "ORGANIZATION"],
      );
      await service.create(ACTOR, {
        ...base,
        status: "READY",
        teamIds: [TEAM_ID],
        budgetAmount: 2500000,
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "READY",
          teamIds: [TEAM_ID],
          budget: { amount: 2500000, currency: "ETB" },
        }),
        expect.objectContaining({ actorUserId: ACTOR }),
      );
    });

    it("maps an unknown team to EVENT_TEAM_NOT_FOUND", async () => {
      grantOnly(
        ["event.create", "ORGANIZATION"],
        ["event.assign_teams", "ORGANIZATION"],
      );
      repository.create.mockResolvedValue("team_not_found");
      await expectCode(
        service.create(ACTOR, { ...base, teamIds: [TEAM_ID] }),
        "EVENT_TEAM_NOT_FOUND",
      );
    });
  });

  describe("workspace: milestones and activity", () => {
    const milestone = {
      id: "m-1",
      eventId: "evt-1",
      name: "Doors open",
      description: null,
      dueDate: new Date("2026-10-24T00:00:00.000Z"),
      status: "NOT_STARTED" as const,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    };

    it("needs event.update to change a milestone, even with event.read", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      await expectCode(
        service.createMilestone(
          ACTOR,
          "evt-1",
          { name: "x", dueDate: "2026-10-24" },
          "req-1",
        ),
        "PERMISSION_DENIED",
      );
      await expectCode(
        service.deleteMilestone(ACTOR, "evt-1", "m-1", "req-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.createMilestone).not.toHaveBeenCalled();
      expect(repository.deleteMilestone).not.toHaveBeenCalled();
    });

    it("trims a new milestone and returns its due date as a calendar date", async () => {
      grantOnly(["event.update", "ORGANIZATION"]);
      repository.createMilestone.mockResolvedValue(milestone);
      const created = await service.createMilestone(
        ACTOR,
        "evt-1",
        { name: "  Doors open  ", dueDate: "2026-10-24" },
        "req-1",
      );
      expect(repository.createMilestone).toHaveBeenCalledWith(
        expect.objectContaining({ id: "evt-1" }),
        { name: "Doors open", dueDate: new Date("2026-10-24") },
        { actorUserId: ACTOR, requestId: "req-1" },
      );
      expect(created.dueDate).toBe("2026-10-24");
    });

    it("maps a milestone outside the event to EVENT_MILESTONE_NOT_FOUND", async () => {
      grantOnly(["event.update", "ORGANIZATION"]);
      repository.updateMilestone.mockResolvedValue("not_found");
      repository.deleteMilestone.mockResolvedValue("not_found");
      await expectCode(
        service.updateMilestone(ACTOR, "evt-1", "m-2", { name: "x" }, "req-1"),
        "EVENT_MILESTONE_NOT_FOUND",
      );
      await expectCode(
        service.deleteMilestone(ACTOR, "evt-1", "m-2", "req-1"),
        "EVENT_MILESTONE_NOT_FOUND",
      );
    });

    it("feeds activity from allowlisted audit actions and never exposes raw metadata", async () => {
      grantOnly(
        ["event.read", "ORGANIZATION"],
        ["task.read", "ORGANIZATION"],
        ["talent.read", "ORGANIZATION"],
      );
      const person = {
        id: "u-1",
        email: "a@b.c",
        firstName: "Ada",
        lastName: "Bell",
      };
      repository.visibleLinkedTaskIds.mockResolvedValue(["t-1"]);
      repository.peopleByIds.mockResolvedValue(new Map([["u-1", person]]));
      auditReader.listWorkActivity.mockResolvedValue([
        {
          id: "a-1",
          occurredAt: new Date("2026-10-01T10:00:00.000Z"),
          action: "event.milestone.created",
          actorUserId: "u-1",
          metadata: { milestoneName: "Doors open", secret: "hidden" },
        },
        {
          id: "a-2",
          occurredAt: new Date("2026-10-01T09:00:00.000Z"),
          action: "event.budget_changed",
          actorUserId: "gone",
          metadata: {},
        },
      ]);

      const feed = await service.activity(ACTOR, "evt-1", 10);

      const query = auditReader.listWorkActivity.mock.calls[0]![0] as {
        eventActions: string[];
        taskActions: string[];
        talentActions: string[];
        taskIds: string[];
      };
      expect(query.taskIds).toEqual(["t-1"]);
      expect(query.eventActions).toContain("event.status_changed");
      expect(query.taskActions).toContain("task.assignee_added");
      expect(query.talentActions).toContain("talent.assignment.created");
      const everything = [
        ...query.eventActions,
        ...query.taskActions,
        ...query.talentActions,
      ];
      expect(everything).not.toContain("authorization.denied");
      expect(everything).not.toContain("talent.conflict_overridden");
      expect(feed).toEqual([
        {
          id: "a-1",
          action: "event.milestone.created",
          occurredAt: "2026-10-01T10:00:00.000Z",
          actor: person,
          subject: "Doors open",
        },
        {
          id: "a-2",
          action: "event.budget_changed",
          occurredAt: "2026-10-01T09:00:00.000Z",
          actor: null,
          subject: null,
        },
      ]);
    });

    it("gives a caller without task or talent scope only the event's own activity", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);

      await service.activity(ACTOR, "evt-1", 10);

      const query = auditReader.listWorkActivity.mock.calls[0]![0] as {
        eventActions: string[];
        taskActions: string[];
        talentActions: string[];
        taskIds: string[];
      };
      expect(repository.visibleLinkedTaskIds).not.toHaveBeenCalled();
      expect(query.taskIds).toEqual([]);
      expect(query.taskActions).toEqual([]);
      expect(query.talentActions).toEqual([]);
      expect(query.eventActions).toContain("event.milestone.created");
    });

    it("limits task lines to the caller's department for department task scope", async () => {
      grantOnly(["event.read", "ORGANIZATION"], ["task.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dept-1");

      await service.activity(ACTOR, "evt-1", 10);

      expect(repository.visibleLinkedTaskIds).toHaveBeenCalledWith("evt-1", {
        organization: false,
        departmentId: "dept-1",
        selfUserId: null,
      });
      const query = auditReader.listWorkActivity.mock.calls[0]![0] as {
        taskActions: string[];
        talentActions: string[];
      };
      expect(query.taskActions).toContain("task.assignee_added");
      expect(query.talentActions).toEqual([]);
    });

    it("limits task lines to the caller's own tasks for self task scope", async () => {
      grantOnly(["event.read", "ORGANIZATION"], ["task.read", "SELF"]);

      await service.activity(ACTOR, "evt-1", 10);

      expect(repository.visibleLinkedTaskIds).toHaveBeenCalledWith("evt-1", {
        organization: false,
        departmentId: null,
        selfUserId: ACTOR,
      });
    });

    it("audits a real manager change, and not a repeat of the same manager", async () => {
      grantOnly(["event.assign_manager", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeEvent({
          manager: {
            id: "u1",
            email: "a@b.c",
            firstName: null,
            lastName: null,
          },
        }),
      );
      await service.setManager(ACTOR, "evt-1", "u1", "req-1");
      expect(auditWriter.record).not.toHaveBeenCalled();

      await service.setManager(ACTOR, "evt-1", "u2", "req-2");
      expect(auditWriter.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "event.manager_changed",
          requestId: "req-2",
          resourceType: "event",
        }),
      );
    });
  });

  describe("listing: progress, sorting and summary", () => {
    it("attaches each event's linked-task progress, zero when none", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({
        items: [makeEvent({ id: "evt-1" }), makeEvent({ id: "evt-2" })],
        total: 2,
      });
      repository.taskProgressFor.mockResolvedValue(
        new Map([["evt-1", { completed: 2, total: 4 }]]),
      );

      const page = await service.list(ACTOR, {
        page: 1,
        pageSize: 25,
      });

      expect(page.items.map((item) => item.progress)).toEqual([
        { completed: 2, total: 4 },
        { completed: 0, total: 0 },
      ]);
    });

    it("passes the requested sort to the repository", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      await service.list(ACTOR, {
        page: 1,
        pageSize: 25,
        sort: "name",
        direction: "desc",
      } as never);
      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: { field: "name", direction: "desc" } }),
      );
    });

    it("returns the summary for the caller's visibility", async () => {
      grantOnly(["event.read", "ORGANIZATION"]);
      repository.summary.mockResolvedValue({
        total: 24,
        upcoming: 6,
        inProgress: 4,
        completed: 14,
      });
      await expect(service.summary(ACTOR)).resolves.toEqual({
        total: 24,
        upcoming: 6,
        inProgress: 4,
        completed: 14,
      });
      expect(repository.summary).toHaveBeenCalledWith(
        { organization: true },
        expect.any(Date),
      );
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
          "eventNumber",
          "eventType",
          "id",
          "location",
          "manager",
          "name",
          "organizerName",
          "participants",
          "progress",
          "reminderAt",
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
