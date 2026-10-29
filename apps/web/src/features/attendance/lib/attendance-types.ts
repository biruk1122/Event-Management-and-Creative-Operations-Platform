import type { components } from "@event-platform/api-client";

export type AttendanceSession =
  components["schemas"]["AttendanceSessionResponse"];
export type MyShift = components["schemas"]["MyShiftResponse"];
export type MobilePunchResult = components["schemas"]["MobilePunchResponse"];
export type EventShift = components["schemas"]["EventShiftResponse"];
export type EventShiftChange =
  components["schemas"]["EventShiftChangeResponse"];
export type EventShiftAssignment =
  components["schemas"]["EventShiftAssignmentResponse"];
export type OvertimeApproval =
  components["schemas"]["OvertimeApprovalResponse"];
export type AttendanceException =
  components["schemas"]["AttendanceExceptionResponse"];
export type AttendanceSummary =
  components["schemas"]["AttendanceSummaryResponse"];
export type Kiosk = components["schemas"]["KioskResponse"];
export type KioskRegistered = components["schemas"]["KioskRegisteredResponse"];
export type WeekdaySchedule =
  components["schemas"]["AttendanceWeekdayScheduleResponse"];
export type Holiday = components["schemas"]["AttendanceHolidayResponse"];

export const SHIFT_STATUSES = [
  "PLANNED",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const VERIFICATION_RESULT_LABELS: Record<string, string> = {
  NOT_APPLICABLE: "Not applicable",
  VERIFIED: "Verified",
  OUT_OF_RANGE: "Outside the event location",
  LOW_ACCURACY: "Low location accuracy",
  LOCATION_UNAVAILABLE: "No device location",
  EXCEPTION_APPROVED: "Exception approved",
};

/** A selectable event, for the shift-scheduling event picker. */
export interface EventOption {
  id: string;
  name: string;
  departmentId: string | null;
}
