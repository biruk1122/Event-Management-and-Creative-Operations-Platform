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
    expenseId: null,
    reportId: null,
    partnerId: null,
    letterId: null,
    documentId: null,
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
    expenseId: null,
    reportId: null,
    partnerId: null,
    letterId: null,
    documentId: null,
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
    expenseId: null,
    reportId: null,
    partnerId: null,
    letterId: null,
    documentId: null,
  },
  {
    id: "notification-4",
    type: "MEETING_INVITATION",
    title: "You were invited to a meeting",
    body: "Venue review",
    createdAt: "2026-09-16T08:00:00.000Z",
    readAt: null,
    taskId: null,
    messageId: null,
    eventId: null,
    meetingId: "meeting-1",
    expenseId: null,
    reportId: null,
    partnerId: null,
    letterId: null,
    documentId: null,
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
    onRemove: vi.fn(),
    onMarkAllRead: vi.fn(),
    onTogglePreference: vi.fn(),
  };
}

describe("NotificationsCenter", () => {
  it("offers removal for both unread and read entries, without navigating", async () => {
    const props = baseProps();
    render(<NotificationsCenter {...props} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove notification: You were assigned a task",
      }),
    );
    expect(props.onRemove).toHaveBeenCalledWith("notification-1");
    expect(props.onMarkRead).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove notification: Task approved",
      }),
    );
    expect(props.onRemove).toHaveBeenCalledWith("notification-3");
  });
  it("keeps opening the feed read-only and explicitly marks all read", async () => {
    const props = baseProps();
    render(<NotificationsCenter {...props} />);
    expect(props.onMarkRead).not.toHaveBeenCalled();
    expect(props.onMarkAllRead).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Mark all as read" }),
    );
    expect(props.onMarkAllRead).toHaveBeenCalledOnce();
  });
  it("shows the caught-up design and lets the user reveal read history", async () => {
    const props = baseProps();
    render(
      <NotificationsCenter {...props} items={[ITEMS[2]!]} unreadCount={0} />,
    );
    expect(screen.getByText("You’re all caught up")).toBeVisible();
    expect(screen.getByText("All read")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Show all notifications" }),
    );
    expect(screen.getByText("Task approved")).toBeVisible();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(props.onMarkRead).not.toHaveBeenCalled();
  });
  it("shows pending actions and recoverable mutation errors", () => {
    render(
      <NotificationsCenter
        {...baseProps()}
        markingAll
        pendingPreferences={["TASK_DUE"]}
        actionError="Please try again."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
    expect(
      screen.getByRole("button", { name: "Marking all read…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Task due enabled" }),
    ).toBeDisabled();
    expect(
      screen
        .getAllByRole("button", { name: "Marking read…" })
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });
  it("filters to unread items and requests a notification be marked read", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<NotificationsCenter {...props} />);

    expect(screen.getByText("3 unread notifications")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Unread/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Task approved")).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Mark as read" })[0]!,
    );
    expect(props.onMarkRead).toHaveBeenCalledWith("notification-1");
  });

  it("links a meeting notification to its deep link and marks it read on click", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<NotificationsCenter {...props} />);

    const link = screen.getByRole("link", {
      name: /You were invited to a meeting/,
    });
    expect(link).toHaveAttribute("href", "/meetings?meetingId=meeting-1");
    await user.click(link);
    expect(props.onMarkRead).toHaveBeenCalledWith("notification-4");
  });
  it("clears a newly read entry from the default notifications list", () => {
    const props = baseProps();
    const { rerender } = render(<NotificationsCenter {...props} />);
    expect(screen.getByText("You were assigned a task")).toBeVisible();
    rerender(
      <NotificationsCenter
        {...props}
        unreadCount={2}
        items={props.items.map((item) =>
          item.id === "notification-1"
            ? { ...item, readAt: "2026-10-19T09:00:00Z" }
            : item,
        )}
      />,
    );
    expect(
      screen.queryByText("You were assigned a task"),
    ).not.toBeInTheDocument();
  });

  it("renders unresolvable notification types as plain, non-interactive text", () => {
    render(<NotificationsCenter {...baseProps()} />);
    expect(
      screen.queryByRole("link", { name: /You were assigned a task/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("You were assigned a task")).toBeVisible();
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
  it("does not claim all notifications are read while older unread entries remain unloaded", () => {
    render(
      <NotificationsCenter
        {...baseProps()}
        items={[]}
        unreadCount={2}
        hasMore
      />,
    );
    expect(
      screen.getByText(
        "No unread notifications in the loaded history. Load more to check older notifications.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Load more notifications" }),
    ).toBeEnabled();
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
