import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { EventsScreen } from "./events-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

const fullAccess: CurrentAccess = {
  userId: "account-1",
  grants: [{ permissionKey: "event.read", scope: "ORGANIZATION" }],
} as CurrentAccess;

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = fullAccess;
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      return {
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      };
    }
    if (path === "/api/v1/events") {
      return {
        data: { items: [], page: 1, pageSize: 10, total: 0 },
        response: { ok: true, status: 200 },
      };
    }
    return {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { ok: true, status: 200 },
    };
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EventsScreen />
    </QueryClientProvider>,
  );
}

describe("EventsScreen access boundary", () => {
  it("renders the manager once an organization-scoped event read grant is confirmed", async () => {
    setup();
    expect(await screen.findByText("0 events")).toBeVisible();
  });

  it("denies a department-scoped reader (event reads are organization-scoped)", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "event.read", scope: "DEPARTMENT" }],
    } as CurrentAccess;
    setup();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
  });

  it("denies a caller with no event read grant", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [],
    } as unknown as CurrentAccess;
    setup();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
  });

  it("shows the session-expired recovery path", async () => {
    currentAccess = null;
    setup();
    expect(await screen.findByText(/Your session expired/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in in another tab" }),
    ).toHaveAttribute("href", "/login?next=%2Fevents");
  });
});
