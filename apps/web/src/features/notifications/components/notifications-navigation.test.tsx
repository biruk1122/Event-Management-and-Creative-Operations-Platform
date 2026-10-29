import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { NotificationsNavigation } from "./notifications-navigation";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get, PUT: put } }));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token" }));

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({
    data: { id: "notification-1", readAt: "2026-09-16T08:00:00.000Z" },
    response: { ok: true, status: 200 },
  });
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
  it("shows an unread-count badge on the bell before the dialog is even opened", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Open notifications" }),
    ).toBeVisible();
    expect(await screen.findByText("2")).toBeVisible();
  });

  it("caps the badge at 9+ for large unread counts", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me/permissions") {
        return Promise.resolve({
          data: currentAccess,
          response: { status: 200 },
        });
      }
      if (path === "/api/v1/notifications/unread-count") {
        return Promise.resolve({
          data: { unreadCount: 12 },
          response: { ok: true, status: 200 },
        });
      }
      return Promise.resolve({
        data: { items: [], nextCursor: null },
        response: { ok: true, status: 200 },
      });
    });
    setup();
    expect(await screen.findByText("9+")).toBeVisible();
  });

  it("hides the badge once there are no unread notifications", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me/permissions") {
        return Promise.resolve({
          data: currentAccess,
          response: { status: 200 },
        });
      }
      if (path === "/api/v1/notifications/unread-count") {
        return Promise.resolve({
          data: { unreadCount: 0 },
          response: { ok: true, status: 200 },
        });
      }
      return Promise.resolve({
        data: { items: [], nextCursor: null },
        response: { ok: true, status: 200 },
      });
    });
    setup();
    await screen.findByRole("button", { name: "Open notifications" });
    await waitFor(() =>
      expect(screen.queryByText("0")).not.toBeInTheDocument(),
    );
  });

  it("shows the real unread count and a recent notification after opening", async () => {
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    expect(await screen.findByText("2 unread notifications.")).toBeVisible();
    expect(screen.getByText("You were assigned a task")).toBeVisible();
  });
  it("clears read notifications from the bell preview", async () => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => {
      const result = await original(path);
      if (path === "/api/v1/notifications")
        result.data.items[0].readAt = "2026-10-19T09:00:00Z";
      if (path === "/api/v1/notifications/unread-count")
        result.data.unreadCount = 0;
      return result;
    });
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    expect(
      await screen.findByText("No notifications right now."),
    ).toBeVisible();
    expect(
      screen.queryByText("You were assigned a task"),
    ).not.toBeInTheDocument();
  });
  it("opens the notifications page and marks an item read when it has no specific destination", async () => {
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    await user.click(
      await screen.findByRole("link", { name: /You were assigned a task/ }),
    );
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/v1/notifications/{id}/read",
        expect.objectContaining({ params: { path: { id: "notification-1" } } }),
      ),
    );
  });

  it("renders nothing when the caller lacks notification.read", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      screen.queryByRole("button", { name: "Open notifications" }),
    ).not.toBeInTheDocument();
  });
  it("reports preview failure and retries instead of showing a false empty feed", async () => {
    const original = get.getMockImplementation()!;
    let failed = true;
    get.mockImplementation((path: string) =>
      path === "/api/v1/notifications" && failed
        ? Promise.resolve({ response: { status: 500 }, data: undefined })
        : original(path),
    );
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    expect(
      await screen.findByText("Notifications could not load."),
    ).toBeVisible();
    expect(
      screen.queryByText("No notifications right now."),
    ).not.toBeInTheDocument();
    failed = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You were assigned a task")).toBeVisible();
  });
  it("links a meeting notification to its deep link and marks it read on click", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me/permissions") {
        return Promise.resolve({
          data: currentAccess,
          response: { status: currentAccess ? 200 : 401 },
        });
      }
      if (path === "/api/v1/notifications/unread-count") {
        return Promise.resolve({
          data: { unreadCount: 1 },
          response: { ok: true, status: 200 },
        });
      }
      return Promise.resolve({
        data: {
          items: [
            {
              id: "notification-1",
              type: "MEETING_INVITATION",
              title: "You were invited to a meeting",
              body: "Venue review",
              createdAt: "2026-09-16T07:30:00.000Z",
              readAt: null,
              taskId: null,
              meetingId: "meeting-1",
              messageId: null,
              eventId: null,
            },
          ],
          nextCursor: null,
        },
        response: { ok: true, status: 200 },
      });
    });
    const user = setup();
    await user.click(
      await screen.findByRole("button", { name: "Open notifications" }),
    );
    const link = await screen.findByRole("link", {
      name: /You were invited to a meeting/,
    });
    expect(link).toHaveAttribute("href", "/meetings?meetingId=meeting-1");
    await user.click(link);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/v1/notifications/{id}/read",
        expect.objectContaining({ params: { path: { id: "notification-1" } } }),
      ),
    );
  });

  it("rechecks permissions when notification access expires", async () => {
    const original = get.getMockImplementation()!;
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/notifications/unread-count") {
        currentAccess = null;
        return Promise.resolve({ response: { status: 401 }, data: undefined });
      }
      return original(path);
    });
    setup();
    await waitFor(() =>
      expect(
        get.mock.calls.filter(
          ([path]) => path === "/api/v1/auth/me/permissions",
        ).length,
      ).toBeGreaterThan(1),
    );
    expect(
      screen.queryByRole("button", { name: "Open notifications" }),
    ).not.toBeInTheDocument();
  });
});
