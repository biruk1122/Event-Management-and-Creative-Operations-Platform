import type { components } from "@event-platform/api-client";

export type KioskEmployeeOption = components["schemas"]["KioskEmployeeOption"];
export type KioskVerifyResult = components["schemas"]["KioskVerifyResponse"];
export type KioskPunchResult = components["schemas"]["KioskPunchResponse"];

/** Result of checking stored kiosk credentials still work. */
export type ActivationCheckOutcome =
  { status: "valid" } | { status: "invalid" } | { status: "unexpected" };

export type VerifyOutcome =
  | { status: "success"; result: KioskVerifyResult }
  | { status: "employee_not_found" }
  | { status: "invalid_credentials" }
  | { status: "account_locked" }
  | { status: "account_inactive" }
  | { status: "kiosk_invalid" }
  | { status: "unexpected" };

export type PunchOutcome =
  | { status: "success"; result: KioskPunchResult }
  | { status: "session_expired" }
  | { status: "already_checked_in" }
  | { status: "no_open_session" }
  | { status: "kiosk_invalid" }
  | { status: "unexpected" };
