import { describe, expect, it } from "vitest";

import { buildAgenda } from "./event-agenda";

describe("buildAgenda", () => {
  it("merges milestones, meetings and task due dates in time order", () => {
    const agenda = buildAgenda({
      milestones: [
        { id: "m1", name: "Venue confirmed", dueDate: "2026-11-10" },
      ],
      meetings: [
        { id: "mt1", title: "Kickoff", startAt: "2026-11-10T09:00:00.000Z" },
      ],
      tasks: [
        { id: "t1", title: "Book lighting", dueAt: "2026-11-09T12:00:00.000Z" },
      ],
    });

    expect(agenda.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "task:t1",
      "milestone:m1",
      "meeting:mt1",
    ]);
    expect(agenda[1]!.allDay).toBe(true);
    expect(agenda[2]!.allDay).toBe(false);
  });

  it("leaves out tasks without a due date", () => {
    const agenda = buildAgenda({
      milestones: [],
      meetings: [],
      tasks: [{ id: "t2", title: "Someday", dueAt: null }],
    });
    expect(agenda).toEqual([]);
  });

  it("orders items at the same instant by title", () => {
    const at = "2026-11-12T10:00:00.000Z";
    const agenda = buildAgenda({
      milestones: [],
      meetings: [
        { id: "b", title: "Beta", startAt: at },
        { id: "a", title: "Alpha", startAt: at },
      ],
      tasks: [],
    });
    expect(agenda.map((item) => item.title)).toEqual(["Alpha", "Beta"]);
  });
});
