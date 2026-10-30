import type {
  AttendanceException,
  EventShift,
  Holiday,
  Kiosk,
  KioskRegistered,
  MobilePunchResult,
  OvertimeApproval,
  WeekdaySchedule,
} from "./attendance-types";

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /attendance/mobile/punch`. */
export type MobilePunchOutcome =
  | { status: "success"; result: MobilePunchResult }
  | { status: "already_checked_in" }
  | { status: "no_open_session" }
  | { status: "not_assigned_to_shift" }
  | { status: "shift_not_available" }
  | { status: "leave_conflict" }
  | { status: "shift_not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export interface ShiftFormValues {
  label: string;
  plannedStartAt: string;
  plannedEndAt: string;
  timeZone: string;
  locationLabel: string;
  latitude: string;
  longitude: string;
  geofenceRadiusMeters: string;
  breakMinutes: string;
}

/** Result of `POST`/`PATCH` on an event shift. */
export type ShiftOutcome =
  | { status: "success"; shift: EventShift }
  | { status: "invalid_schedule"; message: string }
  | { status: "event_not_found" }
  | { status: "shift_not_found" }
  | { status: "shift_not_available" }
  | { status: "shift_not_cancelled" }
  | { status: "field_errors"; fieldErrors: FieldErrors<keyof ShiftFormValues> }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignmentOutcome =
  | { status: "success" }
  | { status: "employee_not_found" }
  | { status: "leave_conflict" }
  | { status: "assignment_not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DecideOvertimeOutcome =
  | { status: "success"; item: OvertimeApproval }
  | { status: "self_approval_forbidden" }
  | { status: "already_decided" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DecideExceptionOutcome =
  | { status: "success"; item: AttendanceException }
  | { status: "self_approval_forbidden" }
  | { status: "already_decided" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RegisterKioskOutcome =
  | { status: "success"; kiosk: KioskRegistered }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<"name" | "locationLabel">;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RevokeKioskOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type { Kiosk, KioskRegistered };

export interface WeekdayScheduleFormValues {
  dayOfWeek: number;
  type: "FULL" | "HALF" | "OFF";
  effectiveFrom: string;
}

export type CreateWeekdayScheduleOutcome =
  | { status: "success"; item: WeekdaySchedule }
  | { status: "conflict" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof WeekdayScheduleFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export interface HolidayFormValues {
  date: string;
  name: string;
}

export type CreateHolidayOutcome =
  | { status: "success"; item: Holiday }
  | { status: "date_taken" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof HolidayFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateHolidayOutcome =
  | { status: "success"; item: Holiday }
  | { status: "date_taken" }
  | { status: "not_found" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof HolidayFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RemoveHolidayOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };
