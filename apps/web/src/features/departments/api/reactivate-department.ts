import type { ReactivateDepartment } from "../lib/departments-outcome";

/**
 * Placeholder for `POST /api/v1/departments/:id/reactivate`. DEP-05 (EVE-61)
 * replaces the body with a real `@event-platform/api-client` call.
 */
export const reactivateDepartment: ReactivateDepartment = () =>
  Promise.resolve({ status: "unexpected" });
