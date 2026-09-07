import type { GetDepartment } from "../lib/departments-outcome";
import { FIXTURE_DEPARTMENTS } from "./fixtures";

/**
 * Placeholder for `GET /api/v1/departments/:id`. DEP-05 (EVE-61) replaces the
 * body with a real `@event-platform/api-client` call and TanStack Query wiring.
 */
export const getDepartment: GetDepartment = (id) =>
  Promise.resolve(
    FIXTURE_DEPARTMENTS.find((department) => department.id === id) ?? null,
  );
