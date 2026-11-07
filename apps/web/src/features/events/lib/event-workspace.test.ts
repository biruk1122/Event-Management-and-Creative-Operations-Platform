import { describe, expect, it } from "vitest";

import {
  activeWorkspaceTab,
  activityPhrase,
  compactAmount,
  detailDateTime,
  EVENT_WORKSPACE_TABS,
  eventReference,
  milestoneDate,
  readinessPercent,
  relativeTime,
  workspaceSchedule,
} from "./event-workspace";

describe("event workspace helpers", () => {
  it("has the seven agreed tabs and no Files tab", () => {
    expect(EVENT_WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Details",
      "Teams",
      "Talents",
      "Tasks",
      "Calendar",
      "Meetings",
    ]);
  });

  it("finds the active tab from the path, nested paths included", () => {
    expect(activeWorkspaceTab("e1", "/events/e1").label).toBe("Overview");
    expect(activeWorkspaceTab("e1", "/events/e1/tasks").label).toBe("Tasks");
    expect(activeWorkspaceTab("e1", "/events/e1/tasks/x").label).toBe("Tasks");
    expect(activeWorkspaceTab("e1", "/events/e1/unknown").label).toBe(
      "Overview",
    );
  });

  it("pads the reference number and keeps long ones whole", () => {
    expect(eventReference({ eventNumber: 24 })).toBe("EVT-024");
    expect(eventReference({ eventNumber: 1234 })).toBe("EVT-1234");
  });

  it("shows schedules in UTC, as they are entered", () => {
    expect(
      workspaceSchedule({
        startAt: "2026-10-24T17:00:00.000Z",
        endAt: "2026-10-24T23:00:00.000Z",
      }),
    ).toBe("Oct 24, 20:00 – Oct 25, 02:00");
    expect(
      workspaceSchedule({
        startAt: "2026-10-24T17:00:00.000Z",
        endAt: "2026-10-25T01:00:00.000Z",
      }),
    ).toBe("Oct 24, 20:00 – Oct 25, 04:00");
    expect(workspaceSchedule({ startAt: null, endAt: null })).toBe(
      "Not scheduled",
    );
    expect(detailDateTime("2026-10-24T17:00:00.000Z")).toBe(
      "Oct 24, 2026 · 20:00",
    );
    expect(detailDateTime(null)).toBe("—");
  });

  it("reads a milestone date without shifting the day", () => {
    expect(milestoneDate("2026-10-24")).toBe("Oct 24");
  });

  it("compacts amounts and calculates readiness", () => {
    expect(compactAmount("2500000.00")).toBe("2.5m");
    expect(readinessPercent({ completed: 28, total: 36 })).toBe(78);
    expect(readinessPercent({ completed: 0, total: 0 })).toBeNull();
  });

  it("describes activity in plain language", () => {
    expect(
      activityPhrase({ action: "event.status_changed", subject: "READY" }),
    ).toBe("moved the event to Ready");
    expect(
      activityPhrase({
        action: "event.milestone.created",
        subject: "Doors open",
      }),
    ).toBe("added the milestone “Doors open”");
    expect(
      activityPhrase({ action: "event.budget_changed", subject: null }),
    ).toBe("updated the budget");
    expect(activityPhrase({ action: "unknown.action", subject: null })).toBe(
      "updated this event",
    );
  });

  it("formats recent times relatively", () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    expect(relativeTime("2026-10-24T11:48:00.000Z", now)).toBe(
      "12 minutes ago",
    );
    expect(relativeTime("2026-10-24T11:59:50.000Z", now)).toBe("just now");
  });
});
