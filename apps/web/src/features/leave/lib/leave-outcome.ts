import type { LeaveGrant, LeaveRequest, LeaveType } from "./leave-types";

type FieldErrors<K extends string> = Partial<Record<K, string>>;

export interface LeaveTypeFormValues {
  name: string;
  description: string;
  isPaid: boolean;
  requiresDocumentation: boolean;
  requiresApproval: boolean;
}

export type CreateLeaveTypeOutcome =
  | { status: "success"; type: LeaveType }
  | { status: "name_taken" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof LeaveTypeFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export interface UpdateLeaveTypeFormValues {
  description: string;
  isPaid: boolean;
  requiresDocumentation: boolean;
  requiresApproval: boolean;
  isActive: boolean;
}

export type UpdateLeaveTypeOutcome =
  | { status: "success"; type: LeaveType }
  | { status: "not_found" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof UpdateLeaveTypeFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export interface LeaveGrantFormValues {
  leaveTypeId: string;
  grantedDays: string;
  note: string;
}

export type CreateLeaveGrantOutcome =
  | { status: "success"; grant: LeaveGrant }
  | { status: "employee_not_found" }
  | { status: "type_not_found" }
  | { status: "type_inactive" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof LeaveGrantFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export interface LeaveRequestFormValues {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export type CreateLeaveRequestOutcome =
  | { status: "success"; request: LeaveRequest }
  | { status: "type_not_found" }
  | { status: "type_inactive" }
  | { status: "invalid_date_range" }
  | { status: "overlap" }
  | { status: "insufficient_balance" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof LeaveRequestFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type WithdrawLeaveRequestOutcome =
  | { status: "success"; request: LeaveRequest }
  | { status: "not_found" }
  | { status: "not_withdrawable" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DecideLeaveRequestOutcome =
  | { status: "success"; request: LeaveRequest }
  | { status: "self_approval_forbidden" }
  | { status: "already_decided" }
  | { status: "insufficient_balance" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };
