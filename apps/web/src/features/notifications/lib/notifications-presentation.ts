import {
  AlarmClock,
  Bell,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  Clock,
  FileText,
  FolderOpen,
  Handshake,
  ListChecks,
  Mail,
  MessageCircle,
  Plane,
  Receipt,
  Ticket,
  TriangleAlert,
  Video,
} from "lucide-react";
import type { NotificationType } from "./notifications-types";
export function notificationAppearance(type: NotificationType) {
  switch (type) {
    case "TASK_OVERDUE":
      return {
        icon: TriangleAlert,
        tone: "danger",
        action: "View task",
        description: "When a task passes its due date",
      };
    case "TASK_DUE":
      return {
        icon: AlarmClock,
        tone: "gold",
        action: "View task",
        description: "Before a task is due",
      };
    case "TASK_ASSIGNED":
    case "TASK_APPROVED":
    case "TASK_REJECTED":
      return {
        icon: ClipboardCheck,
        tone: "gold",
        action: "View task",
        description: "Updates about your tasks",
      };
    case "NEW_MESSAGE":
    case "MESSAGE_MENTION":
      return {
        icon: MessageCircle,
        tone: "rose",
        action: "View message",
        description: "When someone sends you a message",
      };
    case "MEETING_REMINDER":
    case "MEETING_INVITATION":
      return {
        icon: Video,
        tone: "teal",
        action: "View meeting",
        description: "Ahead of scheduled meetings",
      };
    case "EVENT_REMINDER":
      return {
        icon: Ticket,
        tone: "peach",
        action: "View event",
        description: "Ahead of events you are part of",
      };
    case "TODO_REMINDER":
      return {
        icon: ListChecks,
        tone: "green",
        action: "View to-do",
        description: "For items on your to-do list",
      };
    case "REPORT_REMINDER":
      return {
        icon: CalendarClock,
        tone: "gold",
        action: "View report",
        description: "Before a report is due",
      };
    case "REPORT_SUBMITTED":
    case "REPORT_REVIEWED":
      return {
        icon: FileText,
        tone: "teal",
        action: "View report",
        description: "Updates about your reports",
      };
    case "EXPENSE_SUBMITTED":
    case "EXPENSE_REVIEWED":
      return {
        icon: Receipt,
        tone: "green",
        action: "View expense",
        description: "Updates about your expenses",
      };
    case "PARTNER_FOLLOW_UP_DUE":
      return {
        icon: Handshake,
        tone: "peach",
        action: "View partner",
        description: "When a partner relationship needs a follow-up",
      };
    case "LETTER_SHARED":
      return {
        icon: Mail,
        tone: "teal",
        action: "View letter",
        description: "When a letter is shared with you",
      };
    case "DOCUMENT_SHARED":
      return {
        icon: FolderOpen,
        tone: "teal",
        action: "View document",
        description: "When a document is shared with you",
      };
    case "ATTENDANCE_SHIFT_ASSIGNED":
      return {
        icon: CalendarCheck,
        tone: "teal",
        action: "View shift",
        description: "When you're assigned to an event shift",
      };
    case "ATTENDANCE_SHIFT_SCHEDULE_CHANGED":
      return {
        icon: CalendarClock,
        tone: "gold",
        action: "View shift",
        description: "When an assigned shift is rescheduled or cancelled",
      };
    case "ATTENDANCE_OVERTIME_DECIDED":
      return {
        icon: Clock,
        tone: "peach",
        action: "View attendance",
        description: "When your potential overtime is approved or rejected",
      };
    case "ATTENDANCE_EXCEPTION_DECIDED":
      return {
        icon: TriangleAlert,
        tone: "rose",
        action: "View attendance",
        description: "When a flagged attendance exception is decided",
      };
    case "LEAVE_REQUEST_SUBMITTED":
      return {
        icon: Plane,
        tone: "gold",
        action: "Review leave request",
        description: "When a direct report submits a leave request",
      };
    case "LEAVE_REQUEST_DECIDED":
      return {
        icon: Plane,
        tone: "green",
        action: "View leave request",
        description:
          "When your leave request is approved, rejected, or returned",
      };
    default:
      return {
        icon: Bell,
        tone: "rose",
        action: "View update",
        description: "Updates that need your attention",
      };
  }
}
export function notificationGroup(value: string, now: Date) {
  const date = new Date(value),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= today) return "Today";
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  return date >= week ? "Earlier this week" : "Earlier";
}
export function notificationDate(value: string, now: Date) {
  const date = new Date(value),
    minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60 && date.toDateString() === now.toDateString())
    return `${Math.floor(minutes / 60)} hr ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}
