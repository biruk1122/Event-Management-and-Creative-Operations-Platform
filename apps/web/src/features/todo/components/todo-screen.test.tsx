import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { ConnectRealtime } from "@/features/realtime";

import { TodoScreen } from "./todo-screen";

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

const DEFAULT_ROUTES: Record<string, unknown> = {
  "/api/v1/todos": { items: [] },
  "/api/v1/events": { items: [] },
  "/api/v1/projects": { items: [] },
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
      <TodoScreen connect={noopConnect} />
    </QueryClientProvider>,
  );
}

describe("TodoScreen access boundary", () => {
  it("renders the manager once todo.read is confirmed", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "todo.read", scope: "SELF" }],
    };
    setup();
    expect(
      await screen.findByRole("group", { name: "To-do views" }),
    ).toBeVisible();
  });

  it("shows a denied message when the grant is absent", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    expect(
      await screen.findByText("You do not have access to your to-do list."),
    ).toBeVisible();
  });

  it("shows the expired-session state when there is no access record", async () => {
    currentAccess = null;
    setup();
    expect(
      await screen.findByText(
        "Your session expired. Sign in again to recover your to-dos.",
      ),
    ).toBeVisible();
  });
});
