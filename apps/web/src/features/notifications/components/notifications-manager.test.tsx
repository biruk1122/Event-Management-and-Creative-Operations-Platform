import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type {
  ConnectRealtime,
  RealtimeConnectionListener,
  RealtimeConnectionState,
  RealtimeFrameListener,
} from "@/features/realtime";

import { NotificationsManager } from "./notifications-manager";
import type { NotificationItem } from "../lib/notifications-types";

const { get, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, PUT: put, DELETE: del },
}));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const access: CurrentAccess = {
  userId: "viewer-1",
  grants: [{ permissionKey: "notification.read", scope: "SELF" }],
};

function notification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id: "notification-1",
    type: "TASK_ASSIGNED",
    title: "You were assigned a task",
    body: "Confirm venue permits",
    createdAt: "2026-09-16T07:30:00.000Z",
    readAt: null,
    taskId: null,
    messageId: null,
    eventId: null,
    ...overrides,
  };
}

/** A controllable fake connection, mirroring realtime-queries.test.tsx's own. */
function fakeConnect() {
  const listeners: RealtimeConnectionListener[] = [];
  const frameListeners: RealtimeFrameListener[] = [];
  const connect: ConnectRealtime = (listener, onFrame) => {
    listeners.push(listener);
    if (onFrame) frameListeners.push(onFrame);
    return () => {};
  };
  return {
    connect,
    emit: (state: RealtimeConnectionState) =>
      listeners[listeners.length - 1]?.(state),
    emitFrame: (event: string, payload: unknown) =>
      frameListeners[frameListeners.length - 1]?.(event, payload),
  };
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

// Each endpoint's own valid "nothing to report" shape - not one shape
// reused everywhere. React Query treats a queryFn resolving to `undefined`
// as an error in its own right (see notifications-manager.test.tsx's
// "surfaces an error..." cases), so a fallback shaped wrong for a given
// endpoint (e.g. the feed's `{ items, nextCursor }` used for unread-count,
// which has no such fields) would silently error that query on every test
// that does not care about it.
const DEFAULT_ROUTES = {
  "/api/v1/notifications": { items: [], nextCursor: null },
  "/api/v1/notifications/unread-count": { unreadCount: 0 },
  "/api/v1/notifications/preferences": { items: [] },
} as const;

function mockGet(
  routes: Partial<{
    "/api/v1/notifications": unknown;
    "/api/v1/notifications/unread-count": unknown;
    "/api/v1/notifications/preferences": unknown;
  }>,
) {
  get.mockImplementation((path: string) => {
    const value =
      path in routes
        ? routes[path as keyof typeof routes]
        : DEFAULT_ROUTES[path as keyof typeof DEFAULT_ROUTES];
    return Promise.resolve(ok(value));
  });
}

afterEach(() => vi.resetAllMocks());

function setup(fake = fakeConnect()) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationsManager access={access} connect={fake.connect} />
    </QueryClientProvider>,
  );
  return { user, fake, client };
}

describe("NotificationsManager", () => {
  it("loads the feed, unread count, and preferences from the real API", async () => {
    mockGet({
      "/api/v1/notifications": { items: [notification()], nextCursor: null },
      "/api/v1/notifications/unread-count": { unreadCount: 1 },
      "/api/v1/notifications/preferences": {
        items: [{ type: "NEW_MESSAGE", muted: false }],
      },
    });
    setup();

    expect(
      await screen.findByText("You were assigned a task"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 unread notification")).toBeVisible();
    expect(screen.getByLabelText("New message enabled")).toBeChecked();
  });

  it("marks a notification read through the real API and reconciles the cache", async () => {
    mockGet({
      "/api/v1/notifications": { items: [notification()], nextCursor: null },
      "/api/v1/notifications/unread-count": { unreadCount: 1 },
    });
    put.mockResolvedValue(
      ok({ ...notification(), readAt: "2026-09-16T08:00:00.000Z" }),
    );
    const { user } = setup();

    await screen.findByText("You were assigned a task");
    await user.click(screen.getByRole("button", { name: "Mark as read" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/v1/notifications/{id}/read",
        expect.objectContaining({
          params: { path: { id: "notification-1" } },
        }),
      ),
    );
    // Reconciliation refetches the unread count - confirms onSettled ran.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(6));
  });

  it("mutes a preference through the real API", async () => {
    mockGet({
      "/api/v1/notifications/preferences": {
        items: [{ type: "NEW_MESSAGE", muted: false }],
      },
    });
    put.mockResolvedValue({ response: { ok: true, status: 200 } });
    const { user } = setup();

    const toggle = await screen.findByLabelText("New message enabled");
    await user.click(toggle);

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/v1/notifications/preferences/{type}",
        expect.objectContaining({ params: { path: { type: "NEW_MESSAGE" } } }),
      ),
    );
  });

  it("requests the next cursor page on load more", async () => {
    mockGet({
      "/api/v1/notifications": {
        items: [notification()],
        nextCursor: "cursor-2",
      },
    });
    const { user } = setup();

    await user.click(
      await screen.findByRole("button", { name: "Load more notifications" }),
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/notifications",
        expect.objectContaining({
          params: { query: { limit: 25, cursor: "cursor-2" } },
        }),
      ),
    );
  });

  it("shows a reconnecting banner while the live connection drops", async () => {
    mockGet({});
    const { fake } = setup();
    await screen.findByText("End of notifications.");

    fake.emit({ status: "reconnecting", detail: null, rooms: [] });
    expect(
      await screen.findByText("Reconnecting to live updates"),
    ).toBeVisible();
  });

  it("disables interactions when the live connection is denied", async () => {
    mockGet({
      "/api/v1/notifications": { items: [notification()], nextCursor: null },
    });
    const { fake } = setup();
    await screen.findByText("You were assigned a task");

    fake.emit({ status: "denied", detail: "Sign in again.", rooms: [] });
    expect(
      await screen.findByText(
        "Notification actions are temporarily unavailable",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeDisabled();
  });

  it("reconciles the cache when a live notification.invalidated frame arrives", async () => {
    mockGet({
      "/api/v1/notifications/unread-count": { unreadCount: 0 },
    });
    const { fake } = setup();
    await screen.findByText("End of notifications.");
    const callsBeforeFrame = get.mock.calls.length;

    fake.emitFrame("notification.invalidated", {
      notificationId: "notification-2",
      type: "TASK_DUE",
    });

    await waitFor(() =>
      expect(get.mock.calls.length).toBeGreaterThan(callsBeforeFrame),
    );
  });

  it("ignores a frame for an unrelated event name", async () => {
    mockGet({});
    const { fake } = setup();
    await screen.findByText("End of notifications.");
    const callsBeforeFrame = get.mock.calls.length;

    fake.emitFrame("some.other.event", {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(get.mock.calls.length).toBe(callsBeforeFrame);
  });

  it("surfaces an error when the unread count fails, even though the feed succeeds", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/notifications/unread-count") {
        return Promise.resolve({
          data: undefined,
          response: { ok: false, status: 500 },
        });
      }
      if (path === "/api/v1/notifications") {
        return Promise.resolve(
          ok({ items: [notification()], nextCursor: null }),
        );
      }
      return Promise.resolve(ok({ items: [], nextCursor: null }));
    });
    setup();

    expect(
      await screen.findByText("Notifications could not load"),
    ).toBeVisible();
    // The feed itself loaded fine; a silent "0 unread" would be the bug
    // this issue exists to fix.
    expect(
      screen.queryByText("You were assigned a task"),
    ).not.toBeInTheDocument();
  });

  it("surfaces an error when preferences fail, even though the feed succeeds", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/notifications/preferences") {
        return Promise.resolve({
          data: undefined,
          response: { ok: false, status: 500 },
        });
      }
      if (path === "/api/v1/notifications") {
        return Promise.resolve(
          ok({ items: [notification()], nextCursor: null }),
        );
      }
      return Promise.resolve(ok({ items: [], nextCursor: null }));
    });
    setup();

    expect(
      await screen.findByText("Notifications could not load"),
    ).toBeVisible();
  });

  it("retries all three queries on Try again, regardless of which one failed", async () => {
    let unreadShouldFail = true;
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/notifications/unread-count") {
        return unreadShouldFail
          ? Promise.resolve({
              data: undefined,
              response: { ok: false, status: 500 },
            })
          : Promise.resolve(ok({ unreadCount: 2 }));
      }
      if (path === "/api/v1/notifications") {
        return Promise.resolve(
          ok({ items: [notification()], nextCursor: null }),
        );
      }
      return Promise.resolve(ok({ items: [], nextCursor: null }));
    });
    const { user } = setup();

    await screen.findByText("Notifications could not load");
    unreadShouldFail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 unread notifications")).toBeVisible();
    expect(
      await screen.findByText("You were assigned a task"),
    ).toBeInTheDocument();
  });
});
