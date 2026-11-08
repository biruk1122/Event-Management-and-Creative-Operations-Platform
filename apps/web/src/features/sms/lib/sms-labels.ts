export type SmsTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusLabel {
  label: string;
  tone: SmsTone;
  /** Shown beside the status so administrators know what it means. */
  detail: string;
}

/** Message statuses. Each one is distinct, so a skipped or failed message is never shown as sent. */
export const SMS_STATUS_LABELS: Record<string, StatusLabel> = {
  PENDING: { label: "Queued", tone: "neutral", detail: "Waiting to be sent." },
  SENDING: { label: "Sending", tone: "info", detail: "A send is in progress." },
  ACCEPTED: {
    label: "Accepted by provider",
    tone: "info",
    detail: "The provider accepted the message. Delivery is not confirmed.",
  },
  DELIVERED: {
    label: "Delivered",
    tone: "success",
    detail: "The provider confirmed delivery.",
  },
  FAILED: {
    label: "Failed",
    tone: "danger",
    detail: "The provider refused the message. It was not sent.",
  },
  UNCERTAIN: {
    label: "Uncertain",
    tone: "warning",
    detail:
      "The send outcome is unknown. Do not resend it without checking with the provider.",
  },
  CANCELLED: { label: "Cancelled", tone: "neutral", detail: "Not sent." },
  SKIPPED: {
    label: "Skipped",
    tone: "neutral",
    detail: "Not sent, because the recipient's number is missing or invalid.",
  },
};

/** Delivery attempt outcomes. A rejection is an attempt result, distinct from the message status. */
export const SMS_OUTCOME_LABELS: Record<
  string,
  { label: string; tone: SmsTone }
> = {
  ACCEPTED: { label: "Accepted by provider", tone: "info" },
  REJECTED: { label: "Rejected by provider", tone: "danger" },
  UNCERTAIN: { label: "Outcome unknown", tone: "warning" },
};

const REASON_LABELS: Record<string, string> = {
  GLOBAL_DISABLED: "SMS delivery is switched off",
  CATEGORY_DISABLED: "This message category is switched off",
  PROVIDER_DISABLED: "The environment switch is off",
  RECIPIENT_INACTIVE: "The recipient is inactive",
  RECIPIENT_NOT_ELIGIBLE: "The recipient is no longer eligible",
  INVALID_PHONE_NUMBER: "The phone number is invalid",
  MISSING_PHONE_NUMBER: "The recipient has no phone number",
  ASSIGNMENT_REMOVED: "The assignment was removed",
  ASSIGNEE_CHANGED: "The assignee changed",
  TASK_CLOSED: "The task is closed",
  DUE_DATE_CHANGED: "The due date changed",
  MEETING_REMOVED: "The meeting was removed",
  MEETING_NOT_SCHEDULED: "The meeting is no longer scheduled",
  MEETING_NOT_CANCELLED: "The meeting is not cancelled",
  PARTICIPANT_REMOVED: "The person is no longer a participant",
  PARTICIPANT_DECLINED: "The participant declined",
  START_CHANGED: "The start time changed",
  REPORT_REMOVED: "The report was removed",
  REPORT_NOT_PENDING: "The report is no longer pending",
  SUBMISSION_SUPERSEDED: "The report was submitted again",
};

/** A readable reason for a skip, cancellation or failure. Unknown codes are humanised, never hidden. */
export function reasonLabel(code: string | null): string | null {
  if (!code) return null;
  return REASON_LABELS[code] ?? code.toLowerCase().replaceAll("_", " ");
}

const CATEGORY_LABELS: Record<string, string> = {
  TEST: "Connection test",
  TASK_ASSIGNED: "Task assigned",
  TASK_REMINDER: "Task reminder",
  TASK_OVERDUE: "Task overdue",
  MEETING_INVITATION: "Meeting invitation",
  MEETING_CHANGED: "Meeting changed",
  MEETING_REMINDER: "Meeting reminder",
  MEETING_CANCELLED: "Meeting cancelled",
  REPORT_SUBMITTED: "Report submitted",
};

export function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ?? category.toLowerCase().replaceAll("_", " ")
  );
}

export function statusLabel(status: string): StatusLabel {
  return (
    SMS_STATUS_LABELS[status] ?? {
      label: status.toLowerCase(),
      tone: "neutral",
      detail: "",
    }
  );
}
