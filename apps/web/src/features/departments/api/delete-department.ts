import type { DeleteDepartment } from "../lib/departments-outcome";

/**
 * Placeholder for `DELETE /api/v1/departments/:id`. DEP-05 (EVE-61) replaces
 * the body with a real `@event-platform/api-client` call and Problem Details
 * mapping.
 */
export const deleteDepartment: DeleteDepartment = () =>
  Promise.resolve({ status: "unexpected" });
