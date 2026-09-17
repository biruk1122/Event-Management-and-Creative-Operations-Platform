import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { CalendarNavigation } from "./calendar-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let access: CurrentAccess | null;
let status = 200;

beforeEach(() => {
  access = {
    userId: "account-1",
    grants: [{ permissionKey: "calendar.read", scope: "SELF" }],
  };
  status = 200;
  get.mockImplementation(async () => ({ data: access, response: { status } }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarNavigation />
    </QueryClientProvider>,
  );
}

describe("CalendarNavigation", () => {
  it("links to /calendar when the caller can read their calendar", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: "Calendar" }),
    ).toHaveAttribute("href", "/calendar");
  });

  it("renders nothing without a calendar read grant", async () => {
    access = { userId: "account-1", grants: [] };
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Calendar" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active session", async () => {
    access = null;
    status = 401;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Calendar" }),
    ).not.toBeInTheDocument();
  });
});
