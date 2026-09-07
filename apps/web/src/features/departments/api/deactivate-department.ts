import type { DeactivateDepartment } from "../lib/departments-outcome";

/**
 * Placeholder for `POST /api/v1/departments/:id/deactivate`. DEP-05 (EVE-61)
 * replaces the body with a real `@event-platform/api-client` call.
 */
export const deactivateDepartment: DeactivateDepartment = () =>
  Promise.resolve({ status: "unexpected" });
