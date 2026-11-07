import type { SmsCategory } from "./sms.types.js";

/**
 * Central SMS templates. Business modules pass a template key and parameters,
 * never raw text, so message wording and length live in one place.
 */
export interface SmsTemplateDefinition {
  key: string;
  category: SmsCategory;
  /** Placeholders are written as {{name}}. Every placeholder must be supplied. */
  text: string;
}

export const SMS_TEMPLATES = {
  TEST_CONNECTION: {
    key: "test.connection",
    category: "TEST",
    text: "LELA: This is an SMS connection test. No action is needed.",
  },
  TASK_ASSIGNED: {
    key: "task.assigned",
    category: "TASK_ASSIGNED",
    text: "LELA: Hello {{employee_name}}, you have been assigned a new task: {{task_title}} by {{assigned_by}}. Due date: {{due_date}}. Please log in to Lela to view details.",
  },
  TASK_REMINDER: {
    key: "task.reminder",
    category: "TASK_REMINDER",
    text: "LELA REMINDER: Your task {{task_title}} is due on {{due_date}}. Please check your task status and complete it on time.",
  },
  TASK_OVERDUE: {
    key: "task.overdue",
    category: "TASK_OVERDUE",
    text: "LELA OVERDUE: Your task {{task_title}} passed its due date on {{due_date}} and is still incomplete. Please update its status.",
  },
  MEETING_INVITATION: {
    key: "meeting.invitation",
    category: "MEETING_INVITATION",
    text: "LELA: Hello {{employee_name}}, you are invited to the meeting {{meeting_title}} from {{start_time}} to {{end_time}}. Location: {{location}}. Please log in to Lela to respond.",
  },
  MEETING_CHANGED: {
    key: "meeting.changed",
    category: "MEETING_CHANGED",
    text: "LELA: The meeting {{meeting_title}} has been updated. New time: {{start_time}} to {{end_time}}. Location: {{location}}. Please log in to Lela for details.",
  },
  MEETING_REMINDER: {
    key: "meeting.reminder",
    category: "MEETING_REMINDER",
    text: "LELA REMINDER: The meeting {{meeting_title}} starts at {{start_time}}. Location: {{location}}. Please join on time.",
  },
  MEETING_CANCELLED: {
    key: "meeting.cancelled",
    category: "MEETING_CANCELLED",
    text: "LELA: The meeting {{meeting_title}} scheduled for {{start_time}} has been cancelled. Please log in to Lela for details.",
  },
} as const satisfies Record<string, SmsTemplateDefinition>;

export type SmsTemplateName = keyof typeof SMS_TEMPLATES;

/** Longest body accepted for one message (three standard segments). */
export const SMS_MAX_BODY_LENGTH = 480;

/** Task titles are shortened so a long title cannot push a message past the limit. */
export const SMS_MAX_TITLE_LENGTH = 80;

export function renderTemplate(
  name: SmsTemplateName,
  params: Record<string, string> = {},
): string {
  const template: SmsTemplateDefinition = SMS_TEMPLATES[name];
  const body = template.text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`SMS template ${name} is missing parameter ${key}`);
    }
    return value;
  });
  if (body.length > SMS_MAX_BODY_LENGTH) {
    throw new Error(
      `SMS template ${name} exceeds ${SMS_MAX_BODY_LENGTH} characters`,
    );
  }
  return body;
}

/** Shortens a task title for an SMS. */
export function smsTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > SMS_MAX_TITLE_LENGTH
    ? `${trimmed.slice(0, SMS_MAX_TITLE_LENGTH - 1)}…`
    : trimmed;
}
