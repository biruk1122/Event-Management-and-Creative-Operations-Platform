import { describe, expect, it } from "vitest";

import { computeTaskProgress } from "../src/tasks/tasks-progress.domain.js";

describe("computeTaskProgress", () => {
  it("is not tracked when there are no checklist items and no subtasks", () => {
    expect(
      computeTaskProgress({ checklistItems: [], directChildren: [] }),
    ).toBeNull();
  });

  it("computes completed over total from its own checklist, rounded", () => {
    expect(
      computeTaskProgress({
        checklistItems: [
          { completed: true },
          { completed: false },
          { completed: true },
          { completed: false },
        ],
        directChildren: [],
      }),
    ).toBe(50);
  });

  it("rounds a non-even ratio to the nearest percent", () => {
    expect(
      computeTaskProgress({
        checklistItems: [
          { completed: true },
          { completed: false },
          { completed: false },
        ],
        directChildren: [],
      }),
    ).toBe(33);
    expect(
      computeTaskProgress({
        checklistItems: [
          { completed: true },
          { completed: true },
          { completed: false },
        ],
        directChildren: [],
      }),
    ).toBe(67);
  });

  it("aggregates direct subtasks as an unweighted mean when present", () => {
    expect(
      computeTaskProgress({
        checklistItems: [],
        directChildren: [{ progress: 0 }, { progress: 100 }],
      }),
    ).toBe(50);
  });

  it("excludes untracked (null) children from the subtask mean", () => {
    expect(
      computeTaskProgress({
        checklistItems: [],
        directChildren: [{ progress: null }, { progress: 40 }],
      }),
    ).toBe(40);
  });

  it("is not tracked when every subtask is itself untracked", () => {
    expect(
      computeTaskProgress({
        checklistItems: [],
        directChildren: [{ progress: null }, { progress: null }],
      }),
    ).toBeNull();
  });

  it("prefers subtask aggregation over its own checklist when both exist", () => {
    expect(
      computeTaskProgress({
        checklistItems: [{ completed: true }, { completed: true }],
        directChildren: [{ progress: 0 }, { progress: 20 }],
      }),
    ).toBe(10);
  });
});
