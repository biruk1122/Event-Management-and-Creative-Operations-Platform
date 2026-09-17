import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { ConnectRealtime } from "@/features/realtime";

import { NotificationsScreen } from "./notifications-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const noopConnect: ConnectRealtime = () => () => {};

let currentAccess: CurrentAccess | null;

// Each endpoint's own valid "nothing to report" shape - not one shape
// reused everywhere. React Query treats a queryFn resolving to `undefined`
// as an error in its own right, so a fallback shaped wrong for a given
// endpoint (e.g. the feed's `{ items, nextCursor }` used for unread-count,
// which has no such fields) would silently error that query.
const DEFAULT_ROUTES: Record<string, unknown> = {
  "/api/v1/notifications": { items: [], nextCursor: null },
  "/api/v1/notifications/unread-count": { unreadCount: 0 },
  "/api/v1/notifications/preferences": { items: [] },
};

beforeEach(() => {
  currentAccess = { userId: "account-1", grants: [] };
  get.mockImplementation((path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      return Promise.resolve({
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      });
    }
    return Promise.resolve({
      data: DEFAULT_ROUTES[path],
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
      <NotificationsScreen connect={noopConnect} />
    </QueryClientProvider>,
  );
}

describe("NotificationsScreen access boundary", () => {
  it("renders the manager once notification.read is confirmed", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "notification.read", scope: "SELF" }],
    };
    setup();
    expect(await screen.findByText("End of notifications.")).toBeVisible();
  });

  it("shows a denied message when the grant is absent", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    expect(
      await screen.findByText("You do not have access to notifications."),
    ).toBeVisible();
  });

  it("shows the expired-session state when there is no access record", async () => {
    currentAccess = null;
    setup();
    expect(
      await screen.findByText(
        "Your session expired. Sign in again to recover notifications.",
      ),
    ).toBeVisible();
  });
});
