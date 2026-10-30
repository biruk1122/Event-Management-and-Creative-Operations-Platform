import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import type {
  GetEmployee,
  RegisterEmployee,
  RegisterEmployeeValues,
  SaveEmployeeOutcome,
  EmployeeHrValues,
  UpdateEmployee,
  UpdateEmployeeStatus,
  UpdateEmployeeStatusOutcome,
} from "../lib/employees-outcome";
import type {
  Employee,
  EmployeeGender,
  EmployeeOptions,
  EmploymentStatus,
  EmploymentType,
  PaginatedEmployees,
} from "../lib/employees-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class EmployeesRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This employee no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "EmployeesRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function fieldErrorsFrom(problem: ProblemDetails): Record<string, string> {
  const raw = (problem as { errors?: unknown }).errors;
  const flattened: Record<string, string> = {};
  if (!Array.isArray(raw)) return flattened;
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as { field?: unknown; messages?: unknown };
    if (typeof candidate.field !== "string") continue;
    const message =
      Array.isArray(candidate.messages) &&
      typeof candidate.messages[0] === "string"
        ? candidate.messages[0]
        : undefined;
    if (message) flattened[candidate.field] = message;
  }
  return flattened;
}

function saveFailure(error: unknown, status: number): SaveEmployeeOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "EMPLOYEE_CODE_CONFLICT")
      return { status: "code_conflict" };
    if (error.code === "EMPLOYEE_EMAIL_CONFLICT")
      return { status: "email_conflict" };
    if (error.code === "EMPLOYEE_USER_NOT_FOUND")
      return { status: "user_not_found" };
    if (error.code === "EMPLOYEE_USER_ALREADY_LINKED")
      return { status: "already_linked" };
    if (error.code === "EMPLOYEE_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EMPLOYEE_ASSIGNMENT_INVALID") {
      return { status: "assignment_invalid", detail: error.detail };
    }
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsFrom(error);
      const keys: (keyof RegisterEmployeeValues)[] = [
        "email",
        "firstName",
        "lastName",
        "personalPhone",
        "temporaryPassword",
        "roleId",
        "departmentId",
        "employeeCode",
        "position",
        "employmentType",
        "employmentDate",
        "workLocation",
        "reportingManagerId",
        "grade",
        "description",
        "baseSalary",
        "salaryScale",
        "allowanceAmount",
        "currency",
        "gender",
        "dateOfBirth",
        "city",
        "subCity",
        "woreda",
        "bankAccountNumber",
        "companyPhone",
      ];
      const fieldErrors: Partial<Record<keyof RegisterEmployeeValues, string>> =
        {};
      for (const key of keys) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function statusFailure(
  error: unknown,
  status: number,
): Exclude<UpdateEmployeeStatusOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "EMPLOYEE_ALREADY_IN_STATUS")
      return { status: "already_in_status" };
    if (error.code === "EMPLOYEE_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EMPLOYEE_ASSIGNMENT_INVALID") {
      return { status: "assignment_invalid", detail: error.detail };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListEmployeesParams {
  search?: string;
  departmentId?: string | null;
  employmentType?: EmploymentType | null;
  employmentStatus?: EmploymentStatus | null;
  workLocation?: string;
  sort?: "name" | "employeeCode" | "employmentDate" | "department" | "status";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Employees_list_v1"]["parameters"]["query"]
>;

export async function listEmployees(
  params: ListEmployeesParams,
  signal?: AbortSignal,
): Promise<PaginatedEmployees> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 10,
    sort: params.sort ?? "name",
    direction: params.direction ?? "asc",
  };
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.departmentId) query.departmentId = params.departmentId;
  if (params.employmentType) query.employmentType = params.employmentType;
  if (params.employmentStatus) query.employmentStatus = params.employmentStatus;
  if (params.workLocation?.trim())
    query.workLocation = params.workLocation.trim();

  const { data, response } = await browserApi.GET("/api/v1/employees", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new EmployeesRequestError(response.status);
  return data;
}

export const getEmployee: GetEmployee = async (id, signal?: AbortSignal) => {
  const { data } = await browserApi.GET("/api/v1/employees/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
};

export interface AssignableRole {
  id: string;
  name: string;
}

/**
 * Roles an HR Manager or Super Admin may assign while registering a new
 * employee account - Department Manager and Department Member only. A
 * Super Admin role is deliberately excluded: `EmployeesService` rejects it
 * server-side, so it is never offered here either.
 */
export async function listAssignableEmployeeRoles(
  signal?: AbortSignal,
): Promise<AssignableRole[]> {
  const { data } = await browserApi.GET("/api/v1/roles", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data ?? [])
    .filter(
      (role) =>
        role.isSystem &&
        ["Department Manager", "Department Member"].includes(role.name),
    )
    .map((role) => ({ id: role.id, name: role.name }));
}

/** Resolves `[]` when the search is blank or the caller cannot look up users. */
export async function findLinkableUsers(
  search: string,
  signal?: AbortSignal,
): Promise<
  {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[]
> {
  if (!search.trim()) return [];
  const { data } = await browserApi.GET("/api/v1/employees/linkable-users", {
    params: { query: { search: search.trim() } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? [];
}

export async function getEmployeeOptions(
  signal?: AbortSignal,
): Promise<EmployeeOptions> {
  const { data, response } = await browserApi.GET("/api/v1/employees/options", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new EmployeesRequestError(response.status);
  return data;
}

function toAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRegisterBody(values: RegisterEmployeeValues) {
  return {
    ...(values.userId ? { userId: values.userId } : {}),
    ...(!values.userId
      ? {
          email: values.email.trim(),
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          temporaryPassword: values.temporaryPassword,
          ...(values.personalPhone.trim()
            ? { personalPhone: values.personalPhone.trim() }
            : {}),
          ...(values.roleId ? { roleId: values.roleId } : {}),
          ...(values.departmentId ? { departmentId: values.departmentId } : {}),
        }
      : {}),
    employeeCode: values.employeeCode.trim(),
    position: values.position.trim(),
    employmentType: values.employmentType,
    employmentDate: values.employmentDate,
    ...(values.workLocation.trim()
      ? { workLocation: values.workLocation.trim() }
      : {}),
    ...(values.reportingManagerId
      ? { reportingManagerId: values.reportingManagerId }
      : {}),
    ...(values.grade.trim() ? { grade: values.grade.trim() } : {}),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(() => {
      const amount = toAmount(values.baseSalary);
      return amount !== undefined ? { baseSalary: amount } : {};
    })(),
    ...(values.salaryScale.trim()
      ? { salaryScale: values.salaryScale.trim() }
      : {}),
    ...(() => {
      const amount = toAmount(values.allowanceAmount);
      return amount !== undefined ? { allowanceAmount: amount } : {};
    })(),
    ...(values.currency.trim() ? { currency: values.currency.trim() } : {}),
    ...(values.gender ? { gender: values.gender as EmployeeGender } : {}),
    ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
    ...(values.city.trim() ? { city: values.city.trim() } : {}),
    ...(values.subCity.trim() ? { subCity: values.subCity.trim() } : {}),
    ...(values.woreda.trim() ? { woreda: values.woreda.trim() } : {}),
    ...(values.bankAccountNumber.trim()
      ? { bankAccountNumber: values.bankAccountNumber.trim() }
      : {}),
    ...(values.companyPhone.trim()
      ? { companyPhone: values.companyPhone.trim() }
      : {}),
  };
}

function toUpdateBody(values: Partial<EmployeeHrValues>) {
  const body: Record<string, unknown> = {};
  if (values.firstName !== undefined) body.firstName = values.firstName.trim();
  if (values.lastName !== undefined) body.lastName = values.lastName.trim();
  if (values.personalPhone !== undefined)
    body.personalPhone = values.personalPhone.trim();
  if (values.position !== undefined) body.position = values.position.trim();
  if (values.employmentType !== undefined)
    body.employmentType = values.employmentType;
  if (values.employmentDate !== undefined)
    body.employmentDate = values.employmentDate;
  if (values.workLocation !== undefined)
    body.workLocation = values.workLocation.trim() || null;
  if (values.reportingManagerId !== undefined)
    body.reportingManagerId = values.reportingManagerId;
  if (values.grade !== undefined) body.grade = values.grade.trim() || null;
  if (values.description !== undefined)
    body.description = values.description.trim() || null;
  if (values.baseSalary !== undefined)
    body.baseSalary = toAmount(values.baseSalary) ?? null;
  if (values.salaryScale !== undefined)
    body.salaryScale = values.salaryScale.trim() || null;
  if (values.allowanceAmount !== undefined)
    body.allowanceAmount = toAmount(values.allowanceAmount) ?? null;
  if (values.currency !== undefined)
    body.currency = values.currency.trim() || null;
  if (values.gender !== undefined) body.gender = values.gender || null;
  if (values.dateOfBirth !== undefined)
    body.dateOfBirth = values.dateOfBirth || null;
  if (values.city !== undefined) body.city = values.city.trim() || null;
  if (values.subCity !== undefined)
    body.subCity = values.subCity.trim() || null;
  if (values.woreda !== undefined) body.woreda = values.woreda.trim() || null;
  if (values.bankAccountNumber !== undefined)
    body.bankAccountNumber = values.bankAccountNumber.trim() || null;
  if (values.companyPhone !== undefined)
    body.companyPhone = values.companyPhone.trim() || null;
  return body;
}

export const registerEmployee: RegisterEmployee = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/employees",
      { body: toRegisterBody(values), headers: headers() },
    );
    return data
      ? { status: "success", employee: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateEmployee: UpdateEmployee = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/employees/{id}",
      {
        params: { path: { id } },
        body: toUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", employee: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateEmployeeStatus: UpdateEmployeeStatus = async (
  id,
  status,
) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/employees/{id}/status",
      { params: { path: { id } }, body: { status }, headers: headers() },
    );
    return data
      ? { status: "success", employee: data }
      : statusFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export type { Employee };
