import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { NotificationsNavigation } from "./notifications-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = {
    userId: "account-1",
    grants: [{ permissionKey: "notification.read", scope: "SELF" }],
  };
  get.mockImplementation((path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      return Promise.resolve({
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      });
    }
    if (path === "/api/v1/notifications/unread-count") {
      return Promise.resolve({
        data: { unreadCount: 2 },
        response: { ok: true, status: 200 },
      });
    }
    return Promise.resolve({
      data: {
        items: [
          {
            id: "notification-1",
            type: "TASK_ASSIGNED",
            title: "You were assigned a task",
            body: "Confirm venue permits",
            createdAt: "2026-09-16T07:30:00.000Z",
            readAt: null,
            taskId: null,
            meetingId: null,
            messageId: null,
            eventId: null,
          },
        ],
        nextCursor: null,
      },
      response: { ok: true, status: 200 },
    });
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationsNavigation />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("NotificationsNavigation", () => {
  it("shows the real unread count and a recent notification after opening", async () => {
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    expect(await screen.findByText("2 unread notifications.")).toBeVisible();
    expect(screen.getByText("You were assigned a task")).toBeVisible();
  });

  it("renders nothing when the caller lacks notification.read", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      screen.queryByRole("button", { name: "Open notifications" }),
    ).not.toBeInTheDocument();
  });
});
