import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotificationsCenter } from "./notifications-center";
import type {
  NotificationItem,
  NotificationPreference,
} from "../lib/notifications-types";

const ITEMS: readonly NotificationItem[] = [
  {
    id: "notification-1",
    type: "TASK_ASSIGNED",
    title: "You were assigned a task",
    body: "Confirm venue permits",
    createdAt: "2026-09-16T07:30:00.000Z",
    readAt: null,
    taskId: null,
    messageId: null,
    eventId: null,
    meetingId: null,
  },
  {
    id: "notification-2",
    type: "MESSAGE_MENTION",
    title: "You were mentioned",
    body: "Maya mentioned you in Event launch planning.",
    createdAt: "2026-09-16T06:45:00.000Z",
    readAt: null,
    taskId: null,
    messageId: null,
    eventId: null,
    meetingId: null,
  },
  {
    id: "notification-3",
    type: "TASK_APPROVED",
    title: "Task approved",
    body: "Guest briefing was approved.",
    createdAt: "2026-09-15T15:00:00.000Z",
    readAt: "2026-09-15T15:10:00.000Z",
    taskId: null,
    messageId: null,
    eventId: null,
    meetingId: null,
  },
];

const PREFERENCES: readonly NotificationPreference[] = [
  { type: "TASK_DUE", muted: false },
  { type: "TASK_OVERDUE", muted: false },
  { type: "NEW_MESSAGE", muted: false },
  { type: "MEETING_REMINDER", muted: false },
  { type: "EVENT_REMINDER", muted: false },
  { type: "TODO_REMINDER", muted: false },
  { type: "REPORT_REMINDER", muted: false },
];

function baseProps() {
  return {
    items: ITEMS,
    unreadCount: ITEMS.filter((item) => item.readAt === null).length,
    hasMore: false,
    loadingMore: false,
    preferences: PREFERENCES,
    state: "ready" as const,
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onMarkRead: vi.fn(),
    onTogglePreference: vi.fn(),
  };
}

describe("NotificationsCenter", () => {
  it("filters to unread items and requests a notification be marked read", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<NotificationsCenter {...props} />);

    expect(screen.getByText("2 unread notifications")).toBeVisible();
    await user.click(screen.getByLabelText("Unread only"));
    expect(screen.queryByText("Task approved")).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Mark as read" })[0]!,
    );
    expect(props.onMarkRead).toHaveBeenCalledWith("notification-1");
  });

  it("keeps preference controls keyboard-operable and reports the toggle", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<NotificationsCenter {...props} />);

    const toggle = screen.getByLabelText("Task due enabled");
    expect(toggle).toBeChecked();
    toggle.focus();
    await user.keyboard(" ");
    expect(props.onTogglePreference).toHaveBeenCalledWith("TASK_DUE", true);
  });

  it("requests the next page and shows a loading state while it fetches", async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), hasMore: true };
    const { rerender } = render(<NotificationsCenter {...props} />);
    await user.click(
      screen.getByRole("button", { name: "Load more notifications" }),
    );
    expect(props.onLoadMore).toHaveBeenCalledOnce();

    rerender(<NotificationsCenter {...props} loadingMore />);
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("shows the end of the feed once there is no next page", () => {
    render(<NotificationsCenter {...baseProps()} hasMore={false} />);
    expect(screen.getByText("End of notifications.")).toBeVisible();
  });

  it("communicates loading, reconnecting, and recoverable error states", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <NotificationsCenter {...baseProps()} state="loading" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading notifications",
    );

    rerender(<NotificationsCenter {...baseProps()} state="reconnecting" />);
    expect(screen.getByText("Reconnecting to live updates")).toBeVisible();

    rerender(
      <NotificationsCenter {...baseProps()} state="error" onRetry={retry} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces a disabled state and disables notification actions", () => {
    render(<NotificationsCenter {...baseProps()} state="disabled" />);
    expect(
      screen.getByText("Notification actions are temporarily unavailable"),
    ).toBeVisible();
    for (const button of screen.getAllByRole("button", {
      name: "Mark as read",
    })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByLabelText("Task due enabled")).toBeDisabled();
  });
});
