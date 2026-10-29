import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreateLeaveGrantOutcome,
  CreateLeaveRequestOutcome,
  CreateLeaveTypeOutcome,
  DecideLeaveRequestOutcome,
  LeaveGrantFormValues,
  LeaveRequestFormValues,
  LeaveTypeFormValues,
  UpdateLeaveTypeFormValues,
  UpdateLeaveTypeOutcome,
  WithdrawLeaveRequestOutcome,
} from "../lib/leave-outcome";
import type {
  EligibleEmployee,
  LeaveBalance,
  LeaveGrant,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveType,
} from "../lib/leave-types";

/** Thrown by every read helper when the API does not return a usable body. */
export class LeaveRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this leave data."
          : "We could not load leave data. Try again.",
    );
    this.name = "LeaveRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

// -------------------------------------------------------------------
// Leave types
// -------------------------------------------------------------------

export async function listLeaveTypes(
  includeInactive = false,
  signal?: AbortSignal,
): Promise<LeaveType[]> {
  const { data, response } = await browserApi.GET("/api/v1/leave/types", {
    params: { query: includeInactive ? { includeInactive: true } : {} },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LeaveRequestError(response.status);
  return data;
}

const TYPE_FIELD_KEYS = [
  "name",
  "description",
  "isPaid",
  "requiresDocumentation",
  "requiresApproval",
] as const;

function typeFailure(
  error: unknown,
  status: number,
): Exclude<CreateLeaveTypeOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "LEAVE_TYPE_NAME_TAKEN") return { status: "name_taken" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<Record<(typeof TYPE_FIELD_KEYS)[number], string>> = {};
      for (const key of TYPE_FIELD_KEYS) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) return { status: "field_errors", fieldErrors };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function createLeaveType(
  values: LeaveTypeFormValues,
): Promise<CreateLeaveTypeOutcome> {
  try {
    const description = values.description.trim();
    const { data, error, response } = await browserApi.POST("/api/v1/leave/types", {
      body: {
        name: values.name.trim(),
        isPaid: values.isPaid,
        requiresDocumentation: values.requiresDocumentation,
        requiresApproval: values.requiresApproval,
        ...(description ? { description } : {}),
      },
      headers: headers(),
    });
    return data ? { status: "success", type: data } : typeFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function updateLeaveType(
  id: string,
  values: UpdateLeaveTypeFormValues,
): Promise<UpdateLeaveTypeOutcome> {
  try {
    const description = values.description.trim();
    const { data, error, response } = await browserApi.PATCH("/api/v1/leave/types/{id}", {
      params: { path: { id } },
      body: {
        description: description === "" ? null : description,
        isPaid: values.isPaid,
        requiresDocumentation: values.requiresDocumentation,
        requiresApproval: values.requiresApproval,
        isActive: values.isActive,
      },
      headers: headers(),
    });
    if (data) return { status: "success", type: data };
    if (response.status === 404) return { status: "not_found" };
    if (isProblemDetails(error) && error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<Record<keyof UpdateLeaveTypeFormValues, string>> = {};
      for (const key of ["description", "isPaid", "requiresDocumentation", "requiresApproval", "isActive"] as const) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) return { status: "field_errors", fieldErrors };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

// -------------------------------------------------------------------
// Employee picker (reused from the Tasks feature, like Attendance does)
// -------------------------------------------------------------------

export async function listEligibleEmployees(
  departmentId: string,
  signal?: AbortSignal,
): Promise<EligibleEmployee[]> {
  const { data } = await browserApi.GET("/api/v1/tasks/eligible-assignees", {
    params: { query: { departmentId } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((person) => ({
    id: person.id,
    name:
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      person.email,
  }));
}

// -------------------------------------------------------------------
// Grants and balance
// -------------------------------------------------------------------

export async function listGrants(
  employeeId: string,
  leaveTypeId?: string,
  signal?: AbortSignal,
): Promise<LeaveGrant[]> {
  const { data, response } = await browserApi.GET("/api/v1/leave/grants", {
    params: { query: { employeeId, ...(leaveTypeId ? { leaveTypeId } : {}) } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LeaveRequestError(response.status);
  return data;
}

export async function getBalance(
  employeeId: string,
  leaveTypeId: string,
  signal?: AbortSignal,
): Promise<LeaveBalance> {
  const { data, response } = await browserApi.GET("/api/v1/leave/balance", {
    params: { query: { employeeId, leaveTypeId } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LeaveRequestError(response.status);
  return data;
}

const GRANT_FIELD_KEYS = ["leaveTypeId", "grantedDays", "note"] as const;

function grantFailure(
  error: unknown,
  status: number,
): Exclude<CreateLeaveGrantOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_EMPLOYEE_NOT_FOUND") return { status: "employee_not_found" };
    if (error.code === "LEAVE_TYPE_NOT_FOUND") return { status: "type_not_found" };
    if (error.code === "LEAVE_TYPE_INACTIVE") return { status: "type_inactive" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<Record<(typeof GRANT_FIELD_KEYS)[number], string>> = {};
      for (const key of GRANT_FIELD_KEYS) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) return { status: "field_errors", fieldErrors };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function createGrant(
  employeeId: string,
  values: LeaveGrantFormValues,
): Promise<CreateLeaveGrantOutcome> {
  try {
    const note = values.note.trim();
    const { data, error, response } = await browserApi.POST("/api/v1/leave/grants", {
      body: {
        employeeId,
        leaveTypeId: values.leaveTypeId,
        grantedDays: Number(values.grantedDays),
        ...(note ? { note } : {}),
      },
      headers: headers(),
    });
    return data ? { status: "success", grant: data } : grantFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

// -------------------------------------------------------------------
// Requests
// -------------------------------------------------------------------

export async function listRequests(
  input: { status?: LeaveRequestStatus; employeeId?: string } = {},
  signal?: AbortSignal,
): Promise<LeaveRequest[]> {
  const { data, response } = await browserApi.GET("/api/v1/leave/requests", {
    params: { query: input },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LeaveRequestError(response.status);
  return data;
}

const REQUEST_FIELD_KEYS = ["leaveTypeId", "startDate", "endDate", "reason"] as const;

function requestFailure(
  error: unknown,
  status: number,
): Exclude<CreateLeaveRequestOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "LEAVE_TYPE_NOT_FOUND") return { status: "type_not_found" };
    if (error.code === "LEAVE_TYPE_INACTIVE") return { status: "type_inactive" };
    if (error.code === "LEAVE_INVALID_DATE_RANGE") return { status: "invalid_date_range" };
    if (error.code === "LEAVE_OVERLAP") return { status: "overlap" };
    if (error.code === "LEAVE_INSUFFICIENT_BALANCE") return { status: "insufficient_balance" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<Record<(typeof REQUEST_FIELD_KEYS)[number], string>> = {};
      for (const key of REQUEST_FIELD_KEYS) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) return { status: "field_errors", fieldErrors };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function createRequest(
  values: LeaveRequestFormValues,
): Promise<CreateLeaveRequestOutcome> {
  try {
    const reason = values.reason.trim();
    const { data, error, response } = await browserApi.POST("/api/v1/leave/requests", {
      body: {
        leaveTypeId: values.leaveTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        ...(reason ? { reason } : {}),
      },
      headers: headers(),
    });
    return data ? { status: "success", request: data } : requestFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function withdrawRequest(id: string): Promise<WithdrawLeaveRequestOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/leave/requests/{id}/withdraw",
      { params: { path: { id } }, headers: headers() },
    );
    if (data) return { status: "success", request: data };
    if (isProblemDetails(error)) {
      if (error.code === "LEAVE_REQUEST_NOT_FOUND") return { status: "not_found" };
      if (error.code === "LEAVE_REQUEST_NOT_WITHDRAWABLE") {
        return { status: "not_withdrawable" };
      }
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function decideRequest(
  id: string,
  decision: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES",
  reviewNote?: string,
): Promise<DecideLeaveRequestOutcome> {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/leave/requests/{id}/decision",
      {
        params: { path: { id } },
        body: { decision, ...(reviewNote ? { reviewNote } : {}) },
        headers: headers(),
      },
    );
    if (data) return { status: "success", request: data };
    if (isProblemDetails(error)) {
      if (error.code === "ATTENDANCE_SELF_APPROVAL_FORBIDDEN") {
        return { status: "self_approval_forbidden" };
      }
      if (error.code === "LEAVE_REQUEST_ALREADY_DECIDED") return { status: "already_decided" };
      if (error.code === "LEAVE_INSUFFICIENT_BALANCE") return { status: "insufficient_balance" };
      if (error.code === "LEAVE_REQUEST_NOT_FOUND") return { status: "not_found" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function calendar(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<LeaveRequest[]> {
  const { data, response } = await browserApi.GET("/api/v1/leave/calendar", {
    params: { query: { startDate, endDate } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new LeaveRequestError(response.status);
  return data;
}
