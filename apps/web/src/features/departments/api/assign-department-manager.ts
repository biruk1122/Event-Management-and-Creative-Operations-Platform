import type { AssignManager } from "../lib/departments-outcome";

/**
 * Placeholder for `PUT /api/v1/departments/:id/manager`. DEP-05 (EVE-61)
 * replaces the body with a real `@event-platform/api-client` call and Problem
 * Details mapping.
 */
export const assignDepartmentManager: AssignManager = () =>
  Promise.resolve({ status: "unexpected" });
