import type { Route } from "next";
import type { NotificationItem } from "./notifications-types";

/** Use shipped module routes. These lists do not yet support selecting a
 * notification's specific item through the URL; avoid invented detail paths.
 * Each destination still enforces its own authorization. */
export function notificationHref(item: NotificationItem): Route | null {
  if (item.meetingId) return "/meetings";
  if (item.taskId) return "/tasks";
  if (item.expenseId) return "/expenses";
  if (item.messageId) return "/discuss/dm" as Route;
  if (item.eventId) return "/events";
  if (item.type === "TODO_REMINDER") return "/todos";
  return null;
}
