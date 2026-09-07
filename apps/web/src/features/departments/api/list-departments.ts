import type {
  DepartmentActivity,
  PaginatedDepartments,
} from "../lib/departments-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListDepartmentsQuery {
  status?: DepartmentActivity;
  search?: string;
  page?: number;
}

export type ListDepartments = (
  query: ListDepartmentsQuery,
) => Promise<PaginatedDepartments>;

/**
 * Placeholder for `GET /api/v1/departments`. DEP-05 (EVE-61) replaces the body
 * with a real `@event-platform/api-client` call and TanStack Query wiring.
 * Until then it returns a fixed fixture page so the surface can be built and
 * tested.
 */
export const listDepartments: ListDepartments = () =>
  Promise.resolve(FIXTURE_PAGE);
