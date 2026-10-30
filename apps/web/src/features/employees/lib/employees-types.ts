import type { components } from "@event-platform/api-client";

export type Employee = components["schemas"]["EmployeeResponse"];
export type PaginatedEmployees =
  components["schemas"]["PaginatedEmployeesResponse"];
export type EmployeeOptions = components["schemas"]["EmployeeOptionsResponse"];
export type EmploymentType = Employee["employmentType"];
export type EmploymentStatus = Employee["employmentStatus"];
export type EmployeeGender = NonNullable<Employee["gender"]>;

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "ACTIVE",
  "ON_LEAVE",
  "INACTIVE",
];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
};

export const GENDER_LABELS: Record<EmployeeGender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

/** Offered on the Sex field; "Other" stays out of the picker but
 * `GENDER_LABELS` keeps it so an existing record set that way still
 * displays a real label instead of breaking. */
export const SELECTABLE_GENDERS: readonly EmployeeGender[] = ["MALE", "FEMALE"];

/** The full name, or a fallback when the linked account has no name yet. */
export function displayName(
  employee: Pick<Employee, "firstName" | "lastName">,
): string {
  const parts = [employee.firstName, employee.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "Unnamed employee";
}

/** Whole, human-readable duration since the employment date (e.g. "2 years, 3 months"). */
export function employmentDuration(employmentDate: string): string {
  const start = new Date(employmentDate);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || start > now) return "—";

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) return "Less than a month";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  return parts.join(", ");
}
