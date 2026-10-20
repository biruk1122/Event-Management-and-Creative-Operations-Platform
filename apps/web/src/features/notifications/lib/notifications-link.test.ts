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
};
describe("notification destinations", () => {
  it.each([
    [{ messageId: "message-1" }, "/discuss/dm"],
    [{ meetingId: "meeting-1" }, "/meetings"],
    [{ taskId: "task-1" }, "/tasks"],
    [{ eventId: "event-1" }, "/events"],
    [{ expenseId: "expense-1" }, "/expenses"],
    [{ type: "TODO_REMINDER" }, "/todos"],
  ] as const)("resolves %j to a shipped route", (overrides, path) => {
    expect(notificationHref({ ...item, ...overrides })).toBe(path);
  });
});
