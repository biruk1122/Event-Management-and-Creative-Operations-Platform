import type { components } from "@event-platform/api-client";

export type LeaveType = components["schemas"]["LeaveTypeResponse"];
export type LeaveGrant = components["schemas"]["LeaveGrantResponse"];
export type LeaveBalance = components["schemas"]["LeaveBalanceResponse"];
export type LeaveRequest = components["schemas"]["LeaveRequestResponse"];

export const LEAVE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "RETURNED_FOR_CHANGES",
  "AMENDED",
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  RETURNED_FOR_CHANGES: "Returned for changes",
  AMENDED: "Amended",
};

/** A department's active staff, for the leave-grant employee picker. */
export interface EligibleEmployee {
  id: string;
  name: string;
}
