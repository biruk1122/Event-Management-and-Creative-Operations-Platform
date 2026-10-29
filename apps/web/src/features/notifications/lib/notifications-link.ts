import type { Route } from "next";

import type { NotificationItem } from "./notifications-types";

/** Resolves where clicking a notification should take the user.
 *
 * `meetingId` deep-links into the existing meetings list+detail view, which
 * reads this query param and selects the meeting automatically (see
 * `MeetingsManager`) - no separate `/meetings/{id}` route exists, and this
 * reuses the same list+detail UI meetings already has rather than building
 * one.
 *
 * `taskId`/`expenseId`/`reportId`/`messageId` currently resolve to their
 * feature's general list/landing page only, not the specific item - those
 * features use a Kanban board / a channel-scoped thread / a filterable list
 * rather than meetings' simple list+detail split, so a precise per-item deep
 * link is a separate, larger piece of work than this fix covers. Still
 * strictly better than the previous "notifications are never clickable at
 * all" state.
 */
export function notificationHref(item: NotificationItem): Route | null {
  if (item.meetingId) {
    return `/meetings?meetingId=${encodeURIComponent(item.meetingId)}` as Route;
  }
  if (item.taskId) return "/tasks" as Route;
  if (item.expenseId) return "/expenses" as Route;
  if (item.reportId) return "/reports" as Route;
  if (item.messageId) return "/discuss/dm" as Route;
  if (item.eventId) return "/events";
  if (item.partnerId) return "/partners";
  // Letter/document shares land on the shared-with-me surface, not the
  // management pages - any authenticated recipient (management or not) can
  // open their own Share there, which `/letters`/`/documents` do not allow
  // for a non-management recipient.
  if (item.letterId) return "/shared-with-me?tab=letters" as Route;
  if (item.documentId) return "/shared-with-me?tab=documents" as Route;
  if (item.type === "TODO_REMINDER") return "/todos";
  if (
    item.type === "ATTENDANCE_SHIFT_ASSIGNED" ||
    item.type === "ATTENDANCE_SHIFT_SCHEDULE_CHANGED" ||
    item.type === "ATTENDANCE_OVERTIME_DECIDED" ||
    item.type === "ATTENDANCE_EXCEPTION_DECIDED"
  ) {
    return "/attendance" as Route;
  }
  if (
    item.type === "LEAVE_REQUEST_SUBMITTED" ||
    item.type === "LEAVE_REQUEST_DECIDED"
  ) {
    return "/leave" as Route;
  }
  return null;
}
