/** One child task's contribution to a parent's aggregated progress. */
export interface ChildProgressInput {
  progress: number | null;
}

export interface ChecklistProgressInput {
  completed: boolean;
}

/**
 * The single authoritative progress rule:
 *  - Direct subtasks exist -> unweighted mean of those subtasks' own
 *    `progress`, excluding any child whose progress is null; if every
 *    child is null, the result is null. Subtask aggregation always wins
 *    over this task's own checklist when both exist - the checklist stays
 *    visible/toggleable for tracking, it just never feeds the number.
 *  - No subtasks, checklist items exist -> completed / total, rounded.
 *  - Neither -> null ("not tracked", never a fabricated 0).
 * Rounding is `Math.round` (round-half-up) everywhere. This function is
 * pure and DB-agnostic; `TasksRepository` is the only caller, inside the
 * same transaction as the mutation that may have changed the inputs.
 */
export function computeTaskProgress(input: {
  checklistItems: readonly ChecklistProgressInput[];
  directChildren: readonly ChildProgressInput[];
}): number | null {
  if (input.directChildren.length > 0) {
    const tracked = input.directChildren.filter(
      (child) => child.progress !== null,
    );
    if (tracked.length === 0) return null;
    const sum = tracked.reduce(
      (total, child) => total + (child.progress ?? 0),
      0,
    );
    return Math.round(sum / tracked.length);
  }
  if (input.checklistItems.length === 0) return null;
  const completed = input.checklistItems.filter(
    (item) => item.completed,
  ).length;
  return Math.round((completed / input.checklistItems.length) * 100);
}
