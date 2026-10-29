import { isProblemDetails } from "@/lib/api/problem-details";

import { kioskApi } from "./kiosk-client";
import type {
  ActivationCheckOutcome,
  KioskEmployeeOption,
  PunchOutcome,
  VerifyOutcome,
} from "../lib/kiosk-outcome";

/** Confirms the stored device credentials are still recognized, without
 * displaying any employee data - used only to decide whether to show the
 * activation screen or the employee-selection screen on load. */
export async function checkActivation(): Promise<ActivationCheckOutcome> {
  try {
    const { response } = await kioskApi.GET("/api/v1/attendance/kiosk-session/employees", {
      params: { query: { search: "" } },
      cache: "no-store",
    });
    if (response.ok) return { status: "valid" };
    if (response.status === 403) return { status: "invalid" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function searchEmployees(
  search: string,
  signal?: AbortSignal,
): Promise<KioskEmployeeOption[]> {
  const { data } = await kioskApi.GET("/api/v1/attendance/kiosk-session/employees", {
    params: { query: { search } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? [];
}

export async function verifyEmployee(
  employeeId: string,
  password: string,
): Promise<VerifyOutcome> {
  try {
    const { data, error, response } = await kioskApi.POST(
      "/api/v1/attendance/kiosk-session/verify",
      { body: { employeeId, password } },
    );
    if (data) return { status: "success", result: data };
    if (isProblemDetails(error)) {
      if (error.code === "ATTENDANCE_EMPLOYEE_NOT_FOUND")
        return { status: "employee_not_found" };
      if (error.code === "AUTH_INVALID_CREDENTIALS")
        return { status: "invalid_credentials" };
      if (error.code === "AUTH_ACCOUNT_LOCKED") return { status: "account_locked" };
      if (error.code === "AUTH_ACCOUNT_INACTIVE") return { status: "account_inactive" };
      if (error.code === "ATTENDANCE_KIOSK_INVALID") return { status: "kiosk_invalid" };
    }
    if (response.status === 403) return { status: "kiosk_invalid" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function punch(
  sessionToken: string,
  punchType: "CHECK_IN" | "CHECK_OUT",
  clientRequestId: string,
): Promise<PunchOutcome> {
  try {
    const { data, error, response } = await kioskApi.POST(
      "/api/v1/attendance/kiosk-session/punch",
      { body: { sessionToken, punchType, clientRequestId } },
    );
    if (data) return { status: "success", result: data };
    if (isProblemDetails(error)) {
      if (error.code === "ATTENDANCE_KIOSK_SESSION_EXPIRED")
        return { status: "session_expired" };
      if (error.code === "ATTENDANCE_ALREADY_CHECKED_IN")
        return { status: "already_checked_in" };
      if (error.code === "ATTENDANCE_NO_OPEN_SESSION")
        return { status: "no_open_session" };
      if (error.code === "ATTENDANCE_KIOSK_INVALID") return { status: "kiosk_invalid" };
    }
    if (response.status === 403) return { status: "kiosk_invalid" };
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}
