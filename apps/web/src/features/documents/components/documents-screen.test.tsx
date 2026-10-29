import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { DocumentsScreen } from "./documents-screen";

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

const superAdminAccess: CurrentAccess = {
  userId: "account-1",
  role: "SUPER_ADMIN",
  department: null,
  grants: [{ permissionKey: "document.read", scope: "ORGANIZATION" }],
} as CurrentAccess;

const hrManagerAccess: CurrentAccess = {
  userId: "account-2",
  role: "DEPARTMENT_MANAGER",
  department: { id: "dept-hr", name: "HR & Executive Officer", active: true },
  grants: [{ permissionKey: "document.read", scope: "DEPARTMENT" }],
} as CurrentAccess;

const marketingManagerAccess: CurrentAccess = {
  userId: "account-3",
  role: "DEPARTMENT_MANAGER",
  department: { id: "dept-marketing", name: "Marketing", active: true },
  grants: [{ permissionKey: "document.read", scope: "DEPARTMENT" }],
} as CurrentAccess;

let currentAccess: CurrentAccess | null;
let permissionsFail: boolean;

beforeEach(() => {
  get.mockReset();
  currentAccess = superAdminAccess;
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
    if (path === "/api/v1/documents") {
      return {
        data: { items: [], page: 1, pageSize: 20, total: 0 },
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
      <DocumentsScreen />
    </QueryClientProvider>,
  );
}

describe("DocumentsScreen access boundary", () => {
  it("announces the permission check while it runs", () => {
    get.mockImplementation(() => new Promise(() => undefined));
    setup();

    expect(screen.getByText("Checking permissions…")).toBeVisible();
  });

  it("renders the manager for a Super Admin", async () => {
    setup();

    expect(await screen.findByText("0 documents")).toBeVisible();
  });

  it("renders the manager for the HR & Executive Officer department's own manager", async () => {
    currentAccess = hrManagerAccess;
    setup();

    expect(await screen.findByText("0 documents")).toBeVisible();
  });

  it("denies a Department Manager of any other department", async () => {
    currentAccess = marketingManagerAccess;
    setup();

    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
    expect(get).not.toHaveBeenCalledWith(
      "/api/v1/documents",
      expect.anything(),
    );
  });

  it("shows the session-expired recovery path", async () => {
    currentAccess = null;
    setup();

    expect(await screen.findByText(/Your session expired/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in in another tab" }),
    ).toHaveAttribute("href", "/login?next=%2Fdocuments");
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
