import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { EventsNavigation } from "./events-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let access: CurrentAccess | null;
let status = 200;

beforeEach(() => {
  access = {
    userId: "a1",
    grants: [{ permissionKey: "event.read", scope: "ORGANIZATION" }],
  } as CurrentAccess;
  status = 200;
  get.mockImplementation(async () => ({ data: access, response: { status } }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EventsNavigation />
    </QueryClientProvider>,
  );
}

describe("EventsNavigation", () => {
  it("links to /events when the caller can read events", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/events",
    );
  });

  it("renders nothing for a department-scoped reader", async () => {
    access = {
      userId: "a1",
      grants: [{ permissionKey: "event.read", scope: "DEPARTMENT" }],
    } as CurrentAccess;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Events" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing without an event read grant", async () => {
    access = { userId: "a1", grants: [] } as unknown as CurrentAccess;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Events" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active session", async () => {
    access = null;
    status = 401;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Events" }),
    ).not.toBeInTheDocument();
  });
});
