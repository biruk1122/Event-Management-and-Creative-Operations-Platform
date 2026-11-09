import { describe, expect, it } from "vitest";

import {
  assignmentPhase,
  findConflicts,
  isAssignmentBlocked,
  requiresOverrideConfirmation,
  spansOverlap,
  type OtherAssignment,
} from "../src/talent/talent-assignment.domain.js";
import {
  ADMIN_ORGANIZATION_PERMISSION_KEYS,
  isProductionManager,
} from "../src/common/security/department-access.policy.js";

const day = (value: number) => new Date(Date.UTC(2026, 10, value, 10));
const window = (start: number, end: number | null) => ({
  startAt: day(start),
  endAt: end === null ? null : day(end),
});
const other = (
  overrides: Partial<OtherAssignment> &
    Pick<OtherAssignment, "startAt" | "endAt">,
): OtherAssignment => ({
  id: "other-1",
  kind: "EVENT",
  title: "Other event",
  status: "ASSIGNED",
  ...overrides,
});

describe("spansOverlap", () => {
  it("detects overlapping spans and ignores touching ones", () => {
    expect(spansOverlap(window(10, 12), window(11, 13))).toBe(true);
    expect(spansOverlap(window(10, 12), window(12, 14))).toBe(false);
  });

  it("treats a span with no end as a single moment", () => {
    expect(spansOverlap(window(10, null), window(9, 11))).toBe(true);
    expect(spansOverlap(window(10, null), window(11, 12))).toBe(false);
  });

  it("never reports an overlap when a start date is unknown", () => {
    expect(spansOverlap({ startAt: null, endAt: null }, window(10, 12))).toBe(
      false,
    );
  });
});

describe("findConflicts", () => {
  it("reports an overlap with another active assignment", () => {
    const conflicts = findConflicts({
      window: window(10, 12),
      availability: "AVAILABLE",
      otherAssignments: [other({ ...window(11, 13) })],
      schedules: [],
    });
    expect(conflicts).toEqual([
      expect.objectContaining({
        type: "ASSIGNMENT_OVERLAP",
        assignmentKind: "EVENT",
        assignmentId: "other-1",
      }),
    ]);
  });

  it("ignores completed and cancelled assignments", () => {
    const conflicts = findConflicts({
      window: window(10, 12),
      availability: "AVAILABLE",
      otherAssignments: [
        other({ ...window(10, 12), status: "COMPLETED" }),
        other({ ...window(10, 12), id: "x", status: "CANCELLED" }),
      ],
      schedules: [],
    });
    expect(conflicts).toEqual([]);
  });

  it("reports a talent schedule block that overlaps the window", () => {
    const conflicts = findConflicts({
      window: window(10, 12),
      availability: "AVAILABLE",
      otherAssignments: [],
      schedules: [{ id: "s1", title: "Rehearsal", ...window(10, 11) }],
    });
    expect(conflicts).toEqual([
      expect.objectContaining({ type: "SCHEDULE_OVERLAP", scheduleId: "s1" }),
    ]);
  });

  it("reports unavailable talent as a conflict", () => {
    expect(
      findConflicts({
        window: window(10, 12),
        availability: "UNAVAILABLE",
        otherAssignments: [],
        schedules: [],
      }),
    ).toEqual([{ type: "UNAVAILABLE" }]);
  });

  it("returns no conflicts for a clear window", () => {
    expect(
      findConflicts({
        window: window(10, 12),
        availability: "AVAILABLE",
        otherAssignments: [other({ ...window(20, 21) })],
        schedules: [],
      }),
    ).toEqual([]);
  });
});

describe("isAssignmentBlocked", () => {
  it("blocks inactive talent and nothing else", () => {
    expect(isAssignmentBlocked("INACTIVE")).toBe(true);
    expect(isAssignmentBlocked("UNAVAILABLE")).toBe(false);
    expect(isAssignmentBlocked("AVAILABLE")).toBe(false);
  });
});

describe("requiresOverrideConfirmation", () => {
  const conflict = [{ type: "UNAVAILABLE" as const }];

  it("requires confirmation when a conflict exists and is not acknowledged", () => {
    expect(requiresOverrideConfirmation(conflict, false)).toBe(true);
  });

  it("does not require confirmation once acknowledged or when there is no conflict", () => {
    expect(requiresOverrideConfirmation(conflict, true)).toBe(false);
    expect(requiresOverrideConfirmation([], false)).toBe(false);
  });
});

describe("assignmentPhase", () => {
  const now = day(15);

  it("is upcoming before the start and active after it", () => {
    expect(assignmentPhase("ASSIGNED", day(20), now)).toBe("upcoming");
    expect(assignmentPhase("ASSIGNED", day(10), now)).toBe("active");
    expect(assignmentPhase("ASSIGNED", null, now)).toBe("active");
  });

  it("reports terminal states as final regardless of dates", () => {
    expect(assignmentPhase("COMPLETED", day(20), now)).toBe("completed");
    expect(assignmentPhase("CANCELLED", day(20), now)).toBe("cancelled");
  });
});

describe("Production Manager and Admin talent access", () => {
  const manager = (name: string | null) => ({
    role: "DEPARTMENT_MANAGER" as const,
    department: name === null ? null : { id: "d1", name, active: true },
  });

  it("recognises only a Department Manager of the Production department", () => {
    expect(isProductionManager(manager("Production"))).toBe(true);
    expect(isProductionManager(manager("Marketing"))).toBe(false);
    expect(
      isProductionManager({
        role: "ADMIN",
        department: { id: "d1", name: "Production", active: true },
      }),
    ).toBe(false);
    expect(
      isProductionManager({
        role: "DEPARTMENT_MANAGER",
        department: { id: "d1", name: "Production", active: false },
      }),
    ).toBe(false);
  });

  it("gives Admin the six talent keys, no project keys, and only the campaign approval keys", () => {
    const talent = [
      "talent.create",
      "talent.read",
      "talent.update",
      "talent.transition_status",
      "talent.assign",
      "talent.manage_activities",
    ];
    for (const key of talent) {
      expect(ADMIN_ORGANIZATION_PERMISSION_KEYS).toContain(key);
    }
    const others = ADMIN_ORGANIZATION_PERMISSION_KEYS.filter(
      (key) => !key.startsWith("talent."),
    );
    // Event keys are granted on purpose (organization-wide event management).
    // Projects stay out of Admin's organization grants. From campaigns, Admin
    // holds only the two keys it needs to approve promotion campaigns
    // (EVE-229); `CampaignsService` refuses Admin every other move.
    expect(others.some((key) => key.startsWith("project."))).toBe(false);
    expect(others.filter((key) => key.startsWith("campaign."))).toEqual([
      "campaign.read",
      "campaign.transition_status",
    ]);
  });
});
