import type {
  Employee,
  EmploymentStatus,
  EmploymentType,
} from "./employees-types";

/** Loads one employee for the detail dialog; resolves `null` when it cannot. */
export type GetEmployee = (id: string) => Promise<Employee | null>;

export interface RegisterEmployeeValues {
  /** Set to link an existing user account instead of creating one. */
  userId: string | null;
  // New-account fields, required together when `userId` is null.
  // `personalPhone` is only applied when creating a new account.
  email: string;
  firstName: string;
  lastName: string;
  personalPhone: string;
  temporaryPassword: string;
  roleId: string | null;
  departmentId: string | null;
  // HR fields, always required/optional as noted.
  employeeCode: string;
  position: string;
  employmentType: EmploymentType;
  employmentDate: string;
  workLocation: string;
  reportingManagerId: string | null;
  grade: string;
  description: string;
  baseSalary: string;
  salaryScale: string;
  allowanceAmount: string;
  currency: string;
  gender: string;
  dateOfBirth: string;
  city: string;
  subCity: string;
  woreda: string;
  bankAccountNumber: string;
  companyPhone: string;
}

export interface EmployeeHrValues {
  firstName: string;
  lastName: string;
  personalPhone: string;
  position: string;
  employmentType: EmploymentType;
  employmentDate: string;
  workLocation: string;
  reportingManagerId: string | null;
  grade: string;
  description: string;
  baseSalary: string;
  salaryScale: string;
  allowanceAmount: string;
  currency: string;
  gender: string;
  dateOfBirth: string;
  city: string;
  subCity: string;
  woreda: string;
  bankAccountNumber: string;
  companyPhone: string;
}

export type SaveEmployeeOutcome =
  | { status: "success"; employee: Employee }
  | { status: "code_conflict" }
  | { status: "email_conflict" }
  | { status: "user_not_found" }
  | { status: "already_linked" }
  | { status: "not_found" }
  | { status: "assignment_invalid"; detail?: string }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof RegisterEmployeeValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RegisterEmployee = (
  values: RegisterEmployeeValues,
) => Promise<SaveEmployeeOutcome>;
export type UpdateEmployee = (
  id: string,
  values: Partial<EmployeeHrValues>,
) => Promise<SaveEmployeeOutcome>;

export type UpdateEmployeeStatusOutcome =
  | { status: "success"; employee: Employee }
  | { status: "already_in_status" }
  | { status: "assignment_invalid"; detail?: string }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateEmployeeStatus = (
  id: string,
  status: EmploymentStatus,
) => Promise<UpdateEmployeeStatusOutcome>;
