import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { accessKey } from "@/features/auth/api/access-queries";

import { ReportsScreen } from "./reports-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: vi.fn() },
}));

const reader: CurrentAccess = {
  userId: "author-1",
  grants: [{ permissionKey: "report.read", scope: "SELF" }],
} as CurrentAccess;
let current: CurrentAccess | null;

beforeEach(() => {
  current = reader;
  get.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions")
      return { data: current, response: { status: current ? 200 : 401 } };
    if (path === "/api/v1/reports")
      return {
        data: { items: [], page: 1, pageSize: 10, total: 0 },
        response: { status: 200 },
      };
    return { data: undefined, response: { status: 404 } };
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReportsScreen />
    </QueryClientProvider>,
  );
  return client;
}

describe("ReportsScreen access boundary", () => {
  it("lists reports only after a report read grant is confirmed", async () => {
    setup();
    expect(await screen.findByText("0 reports")).toBeVisible();
    expect(get).toHaveBeenCalledWith("/api/v1/reports", expect.anything());
  });

  it("never requests reports for a caller without report.read", async () => {
    current = { userId: "author-1", grants: [] } as unknown as CurrentAccess;
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have access",
    );
    expect(get).not.toHaveBeenCalledWith("/api/v1/reports", expect.anything());
  });

  it("drops report cache and content on session expiry", async () => {
    const client = setup();
    expect(await screen.findByText("0 reports")).toBeVisible();
    current = null;
    await client.invalidateQueries({ queryKey: accessKey });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "session expired",
    );
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ queryKey: ["reports"] }),
      ).toHaveLength(0),
    );
  });
});
