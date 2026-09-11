import { ProjectStatus } from "../generated/prisma/client.js";

/**
 * The approved general-project lifecycle graph (SRS 9, product vocabulary
 * "General project"):
 *
 *   Planned -> Active | Cancelled
 *   Active  -> Completed | Cancelled
 *   Completed -> (terminal)
 *   Cancelled -> (terminal)
 *
 * This module enforces the shape of the graph only. Entry criteria, who may
 * make each move, and whether a terminal project can be reopened are open in
 * OD-03 and are not decided here; every move is gated by the single
 * `project.transition_status` permission.
 */
const ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  [ProjectStatus.PLANNED]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ACTIVE]: [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [],
  [ProjectStatus.CANCELLED]: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
