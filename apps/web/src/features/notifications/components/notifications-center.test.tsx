import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotificationsCenter } from "./notifications-center";

describe("NotificationsCenter", () => {
  it("filters to unread items and marks a notification as read", async () => {
    const user = userEvent.setup();
    render(<NotificationsCenter />);

    expect(screen.getByText("2 unread notifications")).toBeVisible();
    await user.click(screen.getByLabelText("Unread only"));
    expect(screen.queryByText("Task approved")).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Mark as read" })[0]!,
    );
    expect(screen.getByText("1 unread notification")).toBeVisible();
  });

  it("keeps preference controls keyboard-operable", async () => {
    const user = userEvent.setup();
    render(<NotificationsCenter />);

    const toggle = screen.getByLabelText("Task due enabled");
    expect(toggle).toBeChecked();
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).not.toBeChecked();
  });

  it("loads the next cursor page and announces the end of the feed", async () => {
    const user = userEvent.setup();
    render(
      <NotificationsCenter
        nextItems={[
          {
            id: "next-notification",
            type: "NEW_MESSAGE",
            title: "Older message",
            body: "A previous update",
            createdAt: "2026-09-14T12:00:00.000Z",
            readAt: null,
          },
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Load more notifications" }),
    );
    expect(screen.getByText("Older message")).toBeVisible();
    expect(screen.getByText("End of notifications.")).toBeVisible();
  });

  it("communicates loading, reconnecting, and recoverable error states", async () => {
    const retry = vi.fn();
    const { rerender } = render(<NotificationsCenter state="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading notifications",
    );

    rerender(<NotificationsCenter state="reconnecting" />);
    expect(screen.getByText("Reconnecting to live updates")).toBeVisible();

    rerender(<NotificationsCenter state="error" onRetry={retry} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces a disabled state and disables notification actions", () => {
    render(<NotificationsCenter state="disabled" />);
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
