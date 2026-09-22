import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { TalentRecord } from "../src/talent/infrastructure/talent.repository.js";
import { TalentService } from "../src/talent/talent.service.js";

const ACTOR = "actor-1";

function makeTalent(overrides: Partial<TalentRecord> = {}): TalentRecord {
  return {
    id: "tal-1",
    fullName: "Amina Tesfaye",
    type: "MUSICIAN",
    profileImageId: null,
    email: null,
    phone: null,
    biography: null,
    availability: "AVAILABLE",
    manager: null,
    socialLinks: [],
    schedules: [],
    eventAssignments: [],
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

const AVAILABILITIES = [
  "AVAILABLE",
  "ASSIGNED",
  "UNAVAILABLE",
  "INACTIVE",
] as const;
const ALLOWED_AVAILABILITY: Record<string, readonly string[]> = {
  AVAILABLE: ["ASSIGNED", "UNAVAILABLE", "INACTIVE"],
  ASSIGNED: ["AVAILABLE", "UNAVAILABLE", "INACTIVE"],
  UNAVAILABLE: ["AVAILABLE", "INACTIVE"],
  INACTIVE: [],
};
const AVAILABILITY_PAIRS = AVAILABILITIES.flatMap((from) =>
  AVAILABILITIES.map(
    (to) => [from, to, ALLOWED_AVAILABILITY[from]!.includes(to)] as const,
  ),
);

const ASSIGNMENT_STATUSES = ["ASSIGNED", "COMPLETED", "CANCELLED"] as const;
const ALLOWED_ASSIGNMENT: Record<string, readonly string[]> = {
  ASSIGNED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const ASSIGNMENT_PAIRS = ASSIGNMENT_STATUSES.flatMap((from) =>
  ASSIGNMENT_STATUSES.map(
    (to) => [from, to, ALLOWED_ASSIGNMENT[from]!.includes(to)] as const,
  ),
);

describe("TalentService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setManager: ReturnType<typeof vi.fn>;
    setAvailability: ReturnType<typeof vi.fn>;
    createSocialLink: ReturnType<typeof vi.fn>;
    deleteSocialLink: ReturnType<typeof vi.fn>;
    createSchedule: ReturnType<typeof vi.fn>;
    updateSchedule: ReturnType<typeof vi.fn>;
    deleteSchedule: ReturnType<typeof vi.fn>;
    createEventAssignment: ReturnType<typeof vi.fn>;
    assignmentStatus: ReturnType<typeof vi.fn>;
    transitionAssignment: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: TalentService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeTalent()),
      create: vi.fn().mockResolvedValue(makeTalent()),
      update: vi.fn().mockResolvedValue(makeTalent()),
      setManager: vi.fn().mockResolvedValue(makeTalent()),
      setAvailability: vi.fn().mockResolvedValue(makeTalent()),
      createSocialLink: vi.fn().mockResolvedValue(makeTalent()),
      deleteSocialLink: vi.fn().mockResolvedValue(true),
      createSchedule: vi.fn().mockResolvedValue(makeTalent()),
      updateSchedule: vi.fn().mockResolvedValue(makeTalent()),
      deleteSchedule: vi.fn().mockResolvedValue(true),
      createEventAssignment: vi.fn().mockResolvedValue(makeTalent()),
      assignmentStatus: vi.fn().mockResolvedValue("ASSIGNED"),
      transitionAssignment: vi.fn().mockResolvedValue(makeTalent()),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new TalentService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("authorization is by the exact talent key at ORGANIZATION scope", () => {
    it.each([
      ["list", (s: TalentService) => s.list(ACTOR, { page: 1, pageSize: 25 })],
      ["get", (s: TalentService) => s.get(ACTOR, "tal-1")],
      [
        "create",
        (s: TalentService) =>
          s.create(ACTOR, { fullName: "x", type: "MUSICIAN" }),
      ],
      ["update", (s: TalentService) => s.update(ACTOR, "tal-1", {})],
      [
        "setManager",
        (s: TalentService) => s.setManager(ACTOR, "tal-1", { managerId: null }),
      ],
      [
        "transition",
        (s: TalentService) => s.transition(ACTOR, "tal-1", "ASSIGNED"),
      ],
      [
        "addSocialLink",
        (s: TalentService) =>
          s.addSocialLink(ACTOR, "tal-1", {
            label: "IG",
            url: "https://instagram.com/x",
          }),
      ],
      [
        "removeSocialLink",
        (s: TalentService) => s.removeSocialLink(ACTOR, "tal-1", "link-1"),
      ],
      [
        "addSchedule",
        (s: TalentService) =>
          s.addSchedule(ACTOR, "tal-1", {
            title: "x",
            startAt: "2026-05-01T10:00:00.000Z",
            endAt: "2026-05-01T11:00:00.000Z",
          }),
      ],
      [
        "updateSchedule",
        (s: TalentService) => s.updateSchedule(ACTOR, "tal-1", "sch-1", {}),
      ],
      [
        "removeSchedule",
        (s: TalentService) => s.removeSchedule(ACTOR, "tal-1", "sch-1"),
      ],
      [
        "assignEvent",
        (s: TalentService) =>
          s.assignEvent(ACTOR, "tal-1", { eventId: "evt-1", role: "x" }),
      ],
      [
        "transitionAssignment",
        (s: TalentService) =>
          s.transitionAssignment(ACTOR, "tal-1", "asg-1", "COMPLETED"),
      ],
    ] as const)("%s is denied without a grant", async (_label, call) => {
      grantOnly();
      await expectCode(call(service), "PERMISSION_DENIED");
    });

    it.each([
      ["talent.read", "DEPARTMENT"],
      ["talent.read", "SELF"],
    ] as const)(
      "read is denied for a %s grant at %s scope",
      async (key, scope) => {
        grantOnly([key, scope]);
        await expectCode(
          service.list(ACTOR, { page: 1, pageSize: 25 }),
          "PERMISSION_DENIED",
        );
      },
    );

    it("each write path checks its own key", async () => {
      repository.findById.mockResolvedValue(
        makeTalent({
          schedules: [
            {
              id: "sch-1",
              title: "x",
              startAt: new Date("2026-05-01T10:00:00.000Z"),
              endAt: new Date("2026-05-01T11:00:00.000Z"),
            },
          ],
        }),
      );
      const table: [string, () => Promise<unknown>][] = [
        [
          "talent.create",
          () => service.create(ACTOR, { fullName: "x", type: "MUSICIAN" }),
        ],
        ["talent.update", () => service.update(ACTOR, "tal-1", {})],
        [
          "talent.update",
          () => service.setManager(ACTOR, "tal-1", { managerId: null }),
        ],
        [
          "talent.transition_status",
          () => service.transition(ACTOR, "tal-1", "ASSIGNED"),
        ],
        [
          "talent.update",
          () =>
            service.addSocialLink(ACTOR, "tal-1", {
              label: "IG",
              url: "https://instagram.com/x",
            }),
        ],
        [
          "talent.update",
          () => service.removeSocialLink(ACTOR, "tal-1", "link-1"),
        ],
        [
          "talent.manage_activities",
          () =>
            service.addSchedule(ACTOR, "tal-1", {
              title: "x",
              startAt: "2026-05-01T10:00:00.000Z",
              endAt: "2026-05-01T11:00:00.000Z",
            }),
        ],
        [
          "talent.manage_activities",
          () => service.updateSchedule(ACTOR, "tal-1", "sch-1", {}),
        ],
        [
          "talent.manage_activities",
          () => service.removeSchedule(ACTOR, "tal-1", "sch-1"),
        ],
        [
          "talent.assign",
          () =>
            service.assignEvent(ACTOR, "tal-1", {
              eventId: "evt-1",
              role: "Headliner",
            }),
        ],
        [
          "talent.assign",
          () =>
            service.transitionAssignment(ACTOR, "tal-1", "asg-1", "COMPLETED"),
        ],
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

  // Unlike Projects/Events, every Talent method that resolves an :id checks
  // its permission grant BEFORE loading the record, so an unauthorized
  // caller hitting a nonexistent id is denied, never 404'd.
  describe("authorization precedes not-found on :id routes", () => {
    const ID_ROUTES = [
      ["get", (s: TalentService) => s.get(ACTOR, "missing"), "talent.read"],
      [
        "update",
        (s: TalentService) => s.update(ACTOR, "missing", {}),
        "talent.update",
      ],
      [
        "setManager",
        (s: TalentService) =>
          s.setManager(ACTOR, "missing", { managerId: null }),
        "talent.update",
      ],
      [
        "transition",
        (s: TalentService) => s.transition(ACTOR, "missing", "ASSIGNED"),
        "talent.transition_status",
      ],
      [
        "addSocialLink",
        (s: TalentService) =>
          s.addSocialLink(ACTOR, "missing", {
            label: "IG",
            url: "https://instagram.com/x",
          }),
        "talent.update",
      ],
      [
        "removeSocialLink",
        (s: TalentService) => s.removeSocialLink(ACTOR, "missing", "link-1"),
        "talent.update",
      ],
      [
        "updateSchedule",
        (s: TalentService) => s.updateSchedule(ACTOR, "missing", "sch-1", {}),
        "talent.manage_activities",
      ],
      [
        "removeSchedule",
        (s: TalentService) => s.removeSchedule(ACTOR, "missing", "sch-1"),
        "talent.manage_activities",
      ],
      [
        "assignEvent",
        (s: TalentService) =>
          s.assignEvent(ACTOR, "missing", { eventId: "evt-1", role: "x" }),
        "talent.assign",
      ],
      [
        "transitionAssignment",
        (s: TalentService) =>
          s.transitionAssignment(ACTOR, "missing", "asg-1", "COMPLETED"),
        "talent.assign",
      ],
    ] as const;

    it.each(ID_ROUTES)(
      "%s is denied, not 404, when both the grant and the talent are missing",
      async (_label, call) => {
        repository.findById.mockResolvedValue(null);
        grantOnly();
        await expectCode(call(service), "PERMISSION_DENIED");
      },
    );

    it.each(ID_ROUTES)(
      "%s 404s once granted, having checked the grant first",
      async (_label, call, key) => {
        repository.findById.mockResolvedValue(null);
        grantOnly([key, "ORGANIZATION"]);
        await expectCode(call(service), "TALENT_NOT_FOUND");
        expect(permissions.hasGrant).toHaveBeenCalled();
      },
    );
  });

  describe("availability transitions follow the approved graph", () => {
    it.each(AVAILABILITY_PAIRS)(
      "%s -> %s allowed=%s",
      async (from, to, allowed) => {
        grantOnly(["talent.transition_status", "ORGANIZATION"]);
        repository.findById.mockResolvedValue(
          makeTalent({ availability: from }),
        );
        repository.setAvailability.mockResolvedValue(
          makeTalent({ availability: to }),
        );

        if (allowed) {
          await expect(
            service.transition(ACTOR, "tal-1", to),
          ).resolves.toMatchObject({ availability: to });
          expect(repository.setAvailability).toHaveBeenCalledWith("tal-1", to);
        } else {
          await expectCode(
            service.transition(ACTOR, "tal-1", to),
            "TALENT_AVAILABILITY_TRANSITION_INVALID",
          );
          expect(repository.setAvailability).not.toHaveBeenCalled();
        }
      },
    );

    it("404s when the talent disappears before the update lands", async () => {
      grantOnly(["talent.transition_status", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeTalent({ availability: "AVAILABLE" }),
      );
      repository.setAvailability.mockResolvedValue(null);
      await expectCode(
        service.transition(ACTOR, "tal-1", "ASSIGNED"),
        "TALENT_NOT_FOUND",
      );
    });
  });

  describe("assignment transitions follow the approved graph", () => {
    it.each(ASSIGNMENT_PAIRS)(
      "%s -> %s allowed=%s",
      async (from, to, allowed) => {
        grantOnly(["talent.assign", "ORGANIZATION"]);
        repository.assignmentStatus.mockResolvedValue(from);
        repository.transitionAssignment.mockResolvedValue(makeTalent());

        if (allowed) {
          await expect(
            service.transitionAssignment(ACTOR, "tal-1", "asg-1", to),
          ).resolves.toBeDefined();
          expect(repository.transitionAssignment).toHaveBeenCalledWith(
            "tal-1",
            "asg-1",
            to,
          );
        } else {
          await expectCode(
            service.transitionAssignment(ACTOR, "tal-1", "asg-1", to),
            "TALENT_ASSIGNMENT_TRANSITION_INVALID",
          );
          expect(repository.transitionAssignment).not.toHaveBeenCalled();
        }
      },
    );

    it("404s an unknown assignment id", async () => {
      grantOnly(["talent.assign", "ORGANIZATION"]);
      repository.assignmentStatus.mockResolvedValue(null);
      await expectCode(
        service.transitionAssignment(ACTOR, "tal-1", "missing", "COMPLETED"),
        "TALENT_ASSIGNMENT_NOT_FOUND",
      );
    });
  });

  describe("schedule interval validation", () => {
    beforeEach(() => {
      grantOnly(["talent.manage_activities", "ORGANIZATION"]);
    });

    it("rejects an end at or before the start on create", async () => {
      await expectCode(
        service.addSchedule(ACTOR, "tal-1", {
          title: "x",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T10:00:00.000Z",
        }),
        "TALENT_SCHEDULE_INVALID",
      );
      expect(repository.createSchedule).not.toHaveBeenCalled();
    });

    it("accepts a strictly-later end on create", async () => {
      await expect(
        service.addSchedule(ACTOR, "tal-1", {
          title: "x",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T11:00:00.000Z",
        }),
      ).resolves.toBeDefined();
    });

    it("404s creating a schedule for an unknown talent (no upfront load)", async () => {
      repository.createSchedule.mockResolvedValue(null);
      await expectCode(
        service.addSchedule(ACTOR, "missing", {
          title: "x",
          startAt: "2026-05-01T10:00:00.000Z",
          endAt: "2026-05-01T11:00:00.000Z",
        }),
        "TALENT_NOT_FOUND",
      );
    });

    it("rejects a patch whose new end falls before the existing start", async () => {
      repository.findById.mockResolvedValue(
        makeTalent({
          schedules: [
            {
              id: "sch-1",
              title: "Existing",
              startAt: new Date("2026-05-10T00:00:00.000Z"),
              endAt: new Date("2026-05-10T02:00:00.000Z"),
            },
          ],
        }),
      );
      await expectCode(
        service.updateSchedule(ACTOR, "tal-1", "sch-1", {
          endAt: "2026-05-09T00:00:00.000Z",
        }),
        "TALENT_SCHEDULE_INVALID",
      );
      expect(repository.updateSchedule).not.toHaveBeenCalled();
    });

    it("404s a patch to an unknown schedule id", async () => {
      repository.findById.mockResolvedValue(makeTalent({ schedules: [] }));
      await expectCode(
        service.updateSchedule(ACTOR, "tal-1", "missing", {}),
        "TALENT_SCHEDULE_NOT_FOUND",
      );
    });
  });

  describe("social links", () => {
    beforeEach(() => {
      grantOnly(["talent.update", "ORGANIZATION"]);
    });

    it("maps a duplicate url to TALENT_SOCIAL_LINK_CONFLICT", async () => {
      repository.createSocialLink.mockResolvedValue("conflict");
      await expectCode(
        service.addSocialLink(ACTOR, "tal-1", {
          label: "IG",
          url: "https://instagram.com/x",
        }),
        "TALENT_SOCIAL_LINK_CONFLICT",
      );
    });

    it("404s removing an unknown social link", async () => {
      repository.deleteSocialLink.mockResolvedValue(false);
      await expectCode(
        service.removeSocialLink(ACTOR, "tal-1", "missing"),
        "TALENT_SOCIAL_LINK_NOT_FOUND",
      );
    });
  });

  describe("event assignment conflicts", () => {
    beforeEach(() => {
      grantOnly(["talent.assign", "ORGANIZATION"]);
    });

    it("maps a duplicate assignment to TALENT_EVENT_ASSIGNMENT_CONFLICT", async () => {
      repository.createEventAssignment.mockResolvedValue("conflict");
      await expectCode(
        service.assignEvent(ACTOR, "tal-1", {
          eventId: "evt-1",
          role: "Headliner",
        }),
        "TALENT_EVENT_ASSIGNMENT_CONFLICT",
      );
    });

    it("maps an unknown event to EVENT_NOT_FOUND", async () => {
      repository.createEventAssignment.mockResolvedValue("event_not_found");
      await expectCode(
        service.assignEvent(ACTOR, "tal-1", {
          eventId: "missing",
          role: "Headliner",
        }),
        "EVENT_NOT_FOUND",
      );
    });
  });

  describe("repository outcome mapping", () => {
    it("maps a missing manager to USER_NOT_FOUND on create", async () => {
      grantOnly(["talent.create", "ORGANIZATION"]);
      repository.create.mockResolvedValue("manager_not_found");
      await expectCode(
        service.create(ACTOR, {
          fullName: "x",
          type: "MUSICIAN",
          managerId: "ghost",
        }),
        "USER_NOT_FOUND",
      );
    });

    it("maps setManager outcomes", async () => {
      grantOnly(["talent.update", "ORGANIZATION"]);

      repository.setManager.mockResolvedValue("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "tal-1", { managerId: "ghost" }),
        "USER_NOT_FOUND",
      );

      repository.setManager.mockResolvedValue(null);
      await expectCode(
        service.setManager(ACTOR, "tal-1", { managerId: null }),
        "TALENT_NOT_FOUND",
      );
    });
  });

  describe("profile field normalization", () => {
    it("trims fullName and lowercases+trims email on create", async () => {
      grantOnly(["talent.create", "ORGANIZATION"]);
      await service.create(ACTOR, {
        fullName: "  Amina Tesfaye  ",
        type: "MUSICIAN",
        email: "  AMINA@Example.com ",
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Amina Tesfaye",
          email: "amina@example.com",
        }),
      );
    });

    it("allows explicitly clearing email, phone, and biography on update", async () => {
      grantOnly(["talent.update", "ORGANIZATION"]);
      // UpdateTalentDto's TS field type doesn't declare `| null` (it is a
      // PartialType of CreateTalentDto, unlike Projects' hand-written
      // nullable update DTO), but the service accepts a JSON `null` at
      // runtime to clear the field - the same way the HTTP layer sends it.
      await service.update(ACTOR, "tal-1", {
        email: null,
        phone: null,
        biography: null,
      } as never);
      expect(repository.update).toHaveBeenCalledWith("tal-1", {
        email: null,
        phone: null,
        biography: null,
      });
    });

    it("leaves fields untouched when omitted from the patch", async () => {
      grantOnly(["talent.update", "ORGANIZATION"]);
      await service.update(ACTOR, "tal-1", { fullName: "  Renamed  " });
      expect(repository.update).toHaveBeenCalledWith("tal-1", {
        fullName: "Renamed",
      });
    });
  });

  describe("response contract", () => {
    it("returns ISO strings for every date field and exactly the public keys", async () => {
      grantOnly(["talent.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(
        makeTalent({
          schedules: [
            {
              id: "sch-1",
              title: "Rehearsal",
              startAt: new Date("2026-03-01T09:00:00.000Z"),
              endAt: new Date("2026-03-01T11:00:00.000Z"),
            },
          ],
          eventAssignments: [
            {
              id: "asg-1",
              role: "Headliner",
              status: "ASSIGNED",
              assignedAt: new Date("2026-02-01T00:00:00.000Z"),
              updatedAt: new Date("2026-02-02T00:00:00.000Z"),
              event: { id: "evt-1", name: "Launch" },
            },
          ],
        }),
      );

      const response = await service.get(ACTOR, "tal-1");

      expect(Object.keys(response).sort()).toEqual(
        [
          "availability",
          "biography",
          "createdAt",
          "email",
          "eventAssignments",
          "fullName",
          "id",
          "manager",
          "phone",
          "profileImageId",
          "schedules",
          "socialLinks",
          "type",
          "updatedAt",
        ].sort(),
      );
      expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(response.schedules[0]?.startAt).toBe("2026-03-01T09:00:00.000Z");
      expect(response.schedules[0]?.endAt).toBe("2026-03-01T11:00:00.000Z");
      expect(response.eventAssignments[0]?.assignedAt).toBe(
        "2026-02-01T00:00:00.000Z",
      );
      expect(response.eventAssignments[0]?.updatedAt).toBe(
        "2026-02-02T00:00:00.000Z",
      );
    });
  });
});
