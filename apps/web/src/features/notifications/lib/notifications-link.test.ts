import { describe, expect, it } from "vitest";
import { notificationHref } from "./notifications-link";
import type { NotificationItem } from "./notifications-types";
const item: NotificationItem = {
  id: "notification-1",
  type: "NEW_MESSAGE",
  title: "New message",
  body: "Hello",
  createdAt: "2026-10-19T09:00:00Z",
  readAt: null,
  messageId: null,
  taskId: null,
  eventId: null,
  meetingId: null,
  expenseId: null,
  reportId: null,
  partnerId: null,
  letterId: null,
  documentId: null,
};
describe("notification destinations", () => {
  it.each([
    [{ messageId: "message-1" }, "/discuss/dm"],
    [{ meetingId: "meeting-1" }, "/meetings?meetingId=meeting-1"],
    [{ taskId: "task-1" }, "/tasks"],
    [{ eventId: "event-1" }, "/events"],
    [{ expenseId: "expense-1" }, "/expenses"],
    [{ reportId: "report-1" }, "/reports"],
    [{ letterId: "letter-1" }, "/shared-with-me?tab=letters"],
    [{ documentId: "document-1" }, "/shared-with-me?tab=documents"],
    [{ type: "TODO_REMINDER" }, "/todos"],
  ] as const)("resolves %j to a shipped route", (overrides, path) => {
    expect(notificationHref({ ...item, ...overrides })).toBe(path);
  });
});
