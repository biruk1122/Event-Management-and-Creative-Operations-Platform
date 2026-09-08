import type { AssignableDepartment } from "../lib/teams-types";
import { FIXTURE_DEPARTMENTS } from "./fixtures";

export type ListAssignableDepartments = () => Promise<AssignableDepartment[]>;

/**
 * Placeholder for the department list the create dialog offers as the owner of
 * a new team. TEAM-05 replaces the body with a real `GET /api/v1/departments`
 * call.
 */
export const listAssignableDepartments: ListAssignableDepartments = () =>
  Promise.resolve([...FIXTURE_DEPARTMENTS]);
