import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type {
  AssignmentOutcome,
  CreateHolidayOutcome,
  CreateWeekdayScheduleOutcome,
  DecideExceptionOutcome,
  DecideOvertimeOutcome,
  HolidayFormValues,
  MobilePunchOutcome,
  RegisterKioskOutcome,
  RemoveHolidayOutcome,
  RevokeKioskOutcome,
  ShiftFormValues,
  ShiftOutcome,
  UpdateHolidayOutcome,
  WeekdayScheduleFormValues,
} from "../lib/attendance-outcome";
import type {
  AttendanceException,
  AttendanceSession,
  AttendanceSummary,
  EventOption,
  EventShift,
  EventShiftAssignment,
  EventShiftChange,
  Holiday,
  Kiosk,
  MyShift,
  OvertimeApproval,
  WeekdaySchedule,
} from "../lib/attendance-types";

/** Thrown by every read helper when the API does not return a usable body. */
export class AttendanceRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this attendance data."
          : "We could not load attendance data. Try again.",
    );
    this.name = "AttendanceRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

// -------------------------------------------------------------------
// Employee self-service: shifts, punching, my sessions
// -------------------------------------------------------------------

export async function listMyShifts(signal?: AbortSignal): Promise<MyShift[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/mobile/shifts",
    {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

export async function listMySessions(
  signal?: AbortSignal,
): Promise<AttendanceSession[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/mobile/sessions",
    {
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function punchFailure(
  error: unknown,
  status: number,
): Exclude<MobilePunchOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_ALREADY_CHECKED_IN")
      return { status: "already_checked_in" };
    if (error.code === "ATTENDANCE_NO_OPEN_SESSION")
      return { status: "no_open_session" };
    if (error.code === "ATTENDANCE_NOT_ASSIGNED_TO_SHIFT")
      return { status: "not_assigned_to_shift" };
    if (error.code === "ATTENDANCE_SHIFT_NOT_AVAILABLE")
      return { status: "shift_not_available" };
    if (error.code === "ATTENDANCE_LEAVE_CONFLICT")
      return { status: "leave_conflict" };
    if (error.code === "ATTENDANCE_SHIFT_NOT_FOUND")
      return { status: "shift_not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function punchMobile(input: {
  punchType: "CHECK_IN" | "CHECK_OUT";
  clientRequestId: string;
  eventShiftId?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}): Promise<MobilePunchOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/attendance/mobile/punch",
      { body: input, headers: headers() },
    );
    return data
      ? { status: "success", result: data }
      : punchFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

/** Events the shift-scheduling event picker can offer, mirroring
 * `listAssignableEvents` in the to-do feature - resolves `[]` when the
 * caller cannot read events, rather than blocking the page. */
export async function listAssignableEvents(
  signal?: AbortSignal,
): Promise<EventOption[]> {
  const { data } = await browserApi.GET("/api/v1/events", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((event) => ({
    id: event.id,
    name: event.name,
    departmentId: event.departmentId,
  }));
}

/** A department's active staff, reused from the Tasks feature's own
 * `eligible-assignees` endpoint - every Department Manager role bundle in
 * this RBAC catalog grants `task.create` alongside any `attendance.*`
 * manage key, so this is available to every manager who can reach the
 * shift-assignment screen at all. */
export interface EligibleEmployee {
  id: string;
  name: string;
}

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
// Manager: event shift scheduling
// -------------------------------------------------------------------

export async function listEventShifts(
  eventId: string,
  signal?: AbortSignal,
): Promise<EventShift[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/events/{eventId}/shifts",
    {
      params: { path: { eventId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

export async function listShiftChanges(
  eventId: string,
  shiftId: string,
  signal?: AbortSignal,
): Promise<EventShiftChange[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/events/{eventId}/shifts/{shiftId}/changes",
    {
      params: { path: { eventId, shiftId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

export async function listShiftAssignments(
  eventId: string,
  shiftId: string,
  signal?: AbortSignal,
): Promise<EventShiftAssignment[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/events/{eventId}/shifts/{shiftId}/assignments",
    {
      params: { path: { eventId, shiftId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function shiftBody(values: ShiftFormValues) {
  const label = values.label.trim();
  const locationLabel = values.locationLabel.trim();
  return {
    plannedStartAt: new Date(values.plannedStartAt).toISOString(),
    plannedEndAt: new Date(values.plannedEndAt).toISOString(),
    timeZone: values.timeZone.trim(),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    ...(label ? { label } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(values.geofenceRadiusMeters
      ? { geofenceRadiusMeters: Number(values.geofenceRadiusMeters) }
      : {}),
    ...(values.breakMinutes
      ? { breakMinutes: Number(values.breakMinutes) }
      : {}),
  };
}

const SHIFT_FIELD_KEYS = [
  "label",
  "plannedStartAt",
  "plannedEndAt",
  "timeZone",
  "locationLabel",
  "latitude",
  "longitude",
  "geofenceRadiusMeters",
  "breakMinutes",
] as const;

function shiftFailure(
  error: unknown,
  status: number,
): Exclude<ShiftOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_INVALID_SCHEDULE") {
      return {
        status: "invalid_schedule",
        message: error.detail ?? "That schedule is not valid.",
      };
    }
    if (error.code === "ATTENDANCE_EVENT_NOT_FOUND")
      return { status: "event_not_found" };
    if (error.code === "ATTENDANCE_SHIFT_NOT_FOUND")
      return { status: "shift_not_found" };
    if (error.code === "ATTENDANCE_SHIFT_NOT_AVAILABLE")
      return { status: "shift_not_available" };
    if (error.code === "ATTENDANCE_SHIFT_NOT_CANCELLED")
      return { status: "shift_not_cancelled" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<
        Record<(typeof SHIFT_FIELD_KEYS)[number], string>
      > = {};
      for (const key of SHIFT_FIELD_KEYS) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function createEventShift(
  eventId: string,
  values: ShiftFormValues,
): Promise<ShiftOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/events/{eventId}/shifts",
      {
        params: { path: { eventId } },
        body: shiftBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", shift: data }
      : shiftFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function rescheduleEventShift(
  eventId: string,
  shiftId: string,
  input: { plannedStartAt?: string; plannedEndAt?: string; reason: string },
): Promise<ShiftOutcome> {
  try {
    const body = {
      reason: input.reason.trim(),
      ...(input.plannedStartAt
        ? { plannedStartAt: new Date(input.plannedStartAt).toISOString() }
        : {}),
      ...(input.plannedEndAt
        ? { plannedEndAt: new Date(input.plannedEndAt).toISOString() }
        : {}),
    };
    const { data, error, response } = await browserApi.POST(
      "/api/v1/events/{eventId}/shifts/{shiftId}/reschedule",
      { params: { path: { eventId, shiftId } }, body, headers: headers() },
    );
    return data
      ? { status: "success", shift: data }
      : shiftFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function cancelEventShift(
  eventId: string,
  shiftId: string,
  reason: string,
): Promise<ShiftOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/events/{eventId}/shifts/{shiftId}/cancel",
      {
        params: { path: { eventId, shiftId } },
        body: { reason: reason.trim() },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", shift: data }
      : shiftFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function reinstateEventShift(
  eventId: string,
  shiftId: string,
  reason: string,
): Promise<ShiftOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/events/{eventId}/shifts/{shiftId}/reinstate",
      {
        params: { path: { eventId, shiftId } },
        body: { reason: reason.trim() },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", shift: data }
      : shiftFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

function assignmentFailure(
  error: unknown,
  status: number,
): Exclude<AssignmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_EMPLOYEE_NOT_FOUND")
      return { status: "employee_not_found" };
    if (error.code === "ATTENDANCE_LEAVE_CONFLICT")
      return { status: "leave_conflict" };
    if (error.code === "ATTENDANCE_ASSIGNMENT_NOT_FOUND")
      return { status: "assignment_not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function assignEmployeeToShift(
  eventId: string,
  shiftId: string,
  employeeId: string,
): Promise<AssignmentOutcome> {
  try {
    const { error, response } = await browserApi.POST(
      "/api/v1/events/{eventId}/shifts/{shiftId}/assignments",
      {
        params: { path: { eventId, shiftId } },
        body: { employeeId },
        headers: headers(),
      },
    );
    if (response.status === 204) return { status: "success" };
    return assignmentFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function unassignEmployeeFromShift(
  eventId: string,
  shiftId: string,
  employeeId: string,
): Promise<AssignmentOutcome> {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/events/{eventId}/shifts/{shiftId}/assignments/{employeeId}",
      {
        params: { path: { eventId, shiftId, employeeId } },
        headers: headers(),
      },
    );
    if (response.status === 204) return { status: "success" };
    return assignmentFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

// -------------------------------------------------------------------
// Manager: overtime and exception review
// -------------------------------------------------------------------

export async function listOvertime(
  status?: OvertimeApproval["status"],
  signal?: AbortSignal,
): Promise<OvertimeApproval[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/overtime",
    {
      params: { query: status ? { status } : {} },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function decideOvertimeFailure(
  error: unknown,
  status: number,
): Exclude<DecideOvertimeOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_SELF_APPROVAL_FORBIDDEN")
      return { status: "self_approval_forbidden" };
    if (error.code === "ATTENDANCE_OVERTIME_ALREADY_DECIDED")
      return { status: "already_decided" };
    if (error.code === "ATTENDANCE_OVERTIME_NOT_FOUND")
      return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function decideOvertime(
  id: string,
  decision: "APPROVED" | "REJECTED",
  approvedMinutes?: number,
  decisionReason?: string,
): Promise<DecideOvertimeOutcome> {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/attendance/overtime/{id}",
      {
        params: { path: { id } },
        body: {
          decision,
          ...(decision === "APPROVED" && approvedMinutes !== undefined
            ? { approvedMinutes }
            : {}),
          ...(decisionReason ? { decisionReason } : {}),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", item: data }
      : decideOvertimeFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function listExceptions(
  status?: AttendanceException["status"],
  signal?: AbortSignal,
): Promise<AttendanceException[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/exceptions",
    {
      params: { query: status ? { status } : {} },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function decideExceptionFailure(
  error: unknown,
  status: number,
): Exclude<DecideExceptionOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_SELF_APPROVAL_FORBIDDEN")
      return { status: "self_approval_forbidden" };
    if (error.code === "ATTENDANCE_EXCEPTION_ALREADY_DECIDED")
      return { status: "already_decided" };
    if (error.code === "ATTENDANCE_EXCEPTION_NOT_FOUND")
      return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function decideException(
  id: string,
  decision: "APPROVED" | "REJECTED",
  reviewNote?: string,
): Promise<DecideExceptionOutcome> {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/attendance/exceptions/{id}",
      {
        params: { path: { id } },
        body: { decision, ...(reviewNote ? { reviewNote } : {}) },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", item: data }
      : decideExceptionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

// -------------------------------------------------------------------
// Admin: kiosk devices and reports
// -------------------------------------------------------------------

export async function listKiosks(signal?: AbortSignal): Promise<Kiosk[]> {
  const { data, response } = await browserApi.GET("/api/v1/attendance/kiosks", {
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

export async function registerKiosk(
  name: string,
  locationLabel: string,
): Promise<RegisterKioskOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/attendance/kiosks",
      {
        body: { name: name.trim(), locationLabel: locationLabel.trim() },
        headers: headers(),
      },
    );
    if (data) return { status: "success", kiosk: data };
    if (isProblemDetails(error) && error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<Record<"name" | "locationLabel", string>> = {};
      for (const key of ["name", "locationLabel"] as const) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
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

export async function revokeKiosk(id: string): Promise<RevokeKioskOutcome> {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/attendance/kiosks/{id}",
      {
        params: { path: { id } },
        headers: headers(),
      },
    );
    if (response.status === 204) return { status: "success" };
    if (
      isProblemDetails(error) &&
      error.code === "ATTENDANCE_KIOSK_NOT_FOUND"
    ) {
      return { status: "not_found" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function getSummaryReport(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<AttendanceSummary[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/reports/summary",
    {
      params: { query: { startDate, endDate } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

/** Every individual check-in/check-out over a date range - visible only to
 * Super Admin and the HR & Executive Officer department's manager. The API
 * itself enforces this; a denied caller gets a 403 via
 * `AttendanceRequestError`, same as any other restricted read. */
export async function getDetailedSessions(
  startDate: string,
  endDate: string,
  employeeId?: string,
  signal?: AbortSignal,
): Promise<AttendanceSession[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/reports/sessions",
    {
      params: {
        query: { startDate, endDate, ...(employeeId ? { employeeId } : {}) },
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

// -------------------------------------------------------------------
// Admin: work calendar (weekly schedule + holidays) - Super Admin and the
// HR & Executive Officer department's manager only, enforced by the API.
// -------------------------------------------------------------------

export async function listWeekdaySchedule(
  signal?: AbortSignal,
): Promise<WeekdaySchedule[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/calendar/weekdays",
    { ...(signal ? { signal } : {}), cache: "no-store" },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function weekdayScheduleFailure(
  error: unknown,
  status: number,
): Exclude<CreateWeekdayScheduleOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "ATTENDANCE_WEEKDAY_SCHEDULE_CONFLICT")
      return { status: "conflict" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = (error.errors ?? {}) as Record<string, string | string[]>;
      const fieldErrors: Partial<
        Record<keyof WeekdayScheduleFormValues, string>
      > = {};
      for (const key of ["dayOfWeek", "type", "effectiveFrom"] as const) {
        const value = fields[key];
        if (typeof value === "string") fieldErrors[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") {
          fieldErrors[key] = value[0];
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export async function createWeekdaySchedule(
  values: WeekdayScheduleFormValues,
): Promise<CreateWeekdayScheduleOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/attendance/calendar/weekdays",
      { body: values, headers: headers() },
    );
    return data
      ? { status: "success", item: data }
      : weekdayScheduleFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
}

export async function listHolidays(signal?: AbortSignal): Promise<Holiday[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/attendance/calendar/holidays",
    { ...(signal ? { signal } : {}), cache: "no-store" },
  );
  if (!data) throw new AttendanceRequestError(response.status);
  return data;
}

function holidayFieldErrors(
  error: unknown,
): Partial<Record<keyof HolidayFormValues, string>> | null {
  if (!isProblemDetails(error) || error.code !== "VALIDATION_ERROR")
    return null;
  const fields = (error.errors ?? {}) as Record<string, string | string[]>;
  const fieldErrors: Partial<Record<keyof HolidayFormValues, string>> = {};
  for (const key of ["date", "name"] as const) {
    const value = fields[key];
    if (typeof value === "string") fieldErrors[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") {
      fieldErrors[key] = value[0];
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

export async function createHoliday(
  values: HolidayFormValues,
): Promise<CreateHolidayOutcome> {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/attendance/calendar/holidays",
      {
        body: { date: values.date, name: values.name.trim() },
        headers: headers(),
      },
    );
    if (data) return { status: "success", item: data };
    if (
      isProblemDetails(error) &&
      error.code === "ATTENDANCE_HOLIDAY_DATE_TAKEN"
    ) {
      return { status: "date_taken" };
    }
    const fieldErrors = holidayFieldErrors(error);
    if (fieldErrors) return { status: "field_errors", fieldErrors };
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function updateHoliday(
  id: string,
  values: Partial<HolidayFormValues>,
): Promise<UpdateHolidayOutcome> {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/attendance/calendar/holidays/{id}",
      {
        params: { path: { id } },
        body: {
          ...(values.date !== undefined ? { date: values.date } : {}),
          ...(values.name !== undefined ? { name: values.name.trim() } : {}),
        },
        headers: headers(),
      },
    );
    if (data) return { status: "success", item: data };
    if (isProblemDetails(error)) {
      if (error.code === "ATTENDANCE_HOLIDAY_DATE_TAKEN")
        return { status: "date_taken" };
      if (error.code === "ATTENDANCE_HOLIDAY_NOT_FOUND")
        return { status: "not_found" };
    }
    const fieldErrors = holidayFieldErrors(error);
    if (fieldErrors) return { status: "field_errors", fieldErrors };
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}

export async function removeHoliday(id: string): Promise<RemoveHolidayOutcome> {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/attendance/calendar/holidays/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.status === 204) return { status: "success" };
    if (
      isProblemDetails(error) &&
      error.code === "ATTENDANCE_HOLIDAY_NOT_FOUND"
    ) {
      return { status: "not_found" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "permission_denied" };
    }
    return { status: "unexpected" };
  } catch {
    return { status: "unexpected" };
  }
}
