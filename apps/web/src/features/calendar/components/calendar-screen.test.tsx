import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { CalendarScreen } from "./calendar-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = { userId: "account-1", grants: [] };
  get.mockImplementation((path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      return Promise.resolve({
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      });
    }
    return Promise.resolve({ data: null, response: { status: 404 } });
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarScreen />
    </QueryClientProvider>,
  );
}

describe("CalendarScreen access boundary", () => {
  it("renders the manager once calendar.read is confirmed", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "calendar.read", scope: "SELF" }],
    };
    setup();
    expect(
      await screen.findByRole("group", { name: "Calendar view" }),
    ).toBeVisible();
  });

  it("shows a denied message when the grant is absent", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    expect(
      await screen.findByText("You do not have access to the calendar."),
    ).toBeVisible();
  });

  it("shows the expired-session state when there is no access record", async () => {
    currentAccess = null;
    setup();
    expect(
      await screen.findByText(
        "Your session expired. Sign in again to recover your calendar.",
      ),
    ).toBeVisible();
  });
});
