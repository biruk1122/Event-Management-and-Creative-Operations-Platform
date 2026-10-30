import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { SharedRecordsScreen } from "./shared-records-screen";

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const memberAccess: CurrentAccess = {
  userId: "account-1",
  role: "DEPARTMENT_MEMBER",
  department: { id: "dept-marketing", name: "Marketing", active: true },
  grants: [{ permissionKey: "share.read", scope: "SELF" }],
} as CurrentAccess;

let currentAccess: CurrentAccess | null;
let permissionsFail: boolean;

beforeEach(() => {
  get.mockReset();
  currentAccess = memberAccess;
  permissionsFail = false;
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      if (permissionsFail) {
        return { data: undefined, response: { status: 500 } };
      }
      return {
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      };
    }
    if (path === "/api/v1/shared-with-me/letters") {
      return {
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        response: { ok: true, status: 200 },
      };
    }
    return {
      data: { items: [], page: 1, pageSize: 20, total: 0 },
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
      <SharedRecordsScreen />
    </QueryClientProvider>,
  );
}

describe("SharedRecordsScreen", () => {
  it("announces the permission check while it runs", () => {
    get.mockImplementation(() => new Promise(() => undefined));
    setup();

    expect(screen.getByText("Checking permissions…")).toBeVisible();
  });

  it("renders the manager for an ordinary department member - no management permission required", async () => {
    setup();

    expect(await screen.findByText("0 letters")).toBeVisible();
  });

  it("shows the session-expired recovery path", async () => {
    currentAccess = null;
    setup();

    expect(await screen.findByText(/Your session expired/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in in another tab" }),
    ).toHaveAttribute("href", "/login?next=%2Fshared-with-me");
  });

  it("recovers from a failed permission check", async () => {
    permissionsFail = true;
    setup();

    expect(
      await screen.findByText(
        "We could not check your permissions. Try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Check permissions again" }),
    ).toBeVisible();
  });
});
