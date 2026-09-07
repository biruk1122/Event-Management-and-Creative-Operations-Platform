import type { CreateDepartment } from "../lib/departments-outcome";

/**
 * Placeholder for `POST /api/v1/departments`. DEP-05 (EVE-61) replaces the body
 * with a real `@event-platform/api-client` call, TanStack Query wiring, and
 * Problem Details mapping. Until then it resolves to the "unexpected" state so
 * the screen is never mistaken for a working create.
 */
export const createDepartment: CreateDepartment = () =>
  Promise.resolve({ status: "unexpected" });
