import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventsManager } from "./events-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { Event } from "../lib/events-types";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const now = "2026-09-01T09:00:00.000Z";

function makeEvent(
  overrides: Partial<Event> & Pick<Event, "id" | "name">,
): Event {
  return {
    workspaceId: `ws-${overrides.id}`,
    eventType: "CONCERT",
    description: null,
    status: "PLANNING",
    startAt: null,
    endAt: null,
    location: null,
    organizerName: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["event.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

let page1: Event[];
let page2: Event[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? page2 : page1;
  return ok({ items, page: requestedPage, pageSize: 10, total });
}

beforeEach(() => {
  vi.resetAllMocks();
  page1 = [
    makeEvent({ id: "e1", name: "Aurora Premiere", status: "READY" }),
    makeEvent({ id: "e2", name: "Midnight Concert" }),
  ];
  page2 = [];
  total = 2;
  get.mockImplementation(
    async (
      path: string,
      opts?: {
        params?: { query?: Record<string, unknown>; path?: { id?: string } };
      },
    ) => {
      if (path === "/api/v1/events") return listResponse(opts?.params?.query);
      if (path === "/api/v1/events/{id}") {
        const id = opts?.params?.path?.id;
        return ok([...page1, ...page2].find((e) => e.id === id) ?? null);
      }
      if (path === "/api/v1/events/{id}/budget")
        return ok({ amount: null, currency: null });
      if (path === "/api/v1/users")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/teams")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      return ok(null);
    },
  );
});

function setup(currentAccess = access("event.create", "event.update")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EventsManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("EventsManager API integration", () => {
  it("fetches the first page from the server", async () => {
    setup();
    expect(await screen.findByText("2 events")).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/events",
      expect.objectContaining({
        params: {
          query: expect.objectContaining({ page: 1, pageSize: 10 }),
        },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    page2 = [makeEvent({ id: "e11", name: "Later Show" })];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/events",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
  });

  it("pushes the status filter to the server", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 events");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "In progress" }),
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/events",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              status: "IN_PROGRESS",
              page: 1,
            }),
          },
        }),
      ),
    );
  });

  it("pushes the debounced name search to the server", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 events");

    await user.type(screen.getByLabelText("Search"), "aurora");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/events",
        expect.objectContaining({
          params: { query: expect.objectContaining({ search: "aurora" }) },
        }),
      ),
    );
  });

  it("creates an event and refetches", async () => {
    post.mockResolvedValue(
      ok(makeEvent({ id: "e-new", name: "Harvest Gala" }), 201),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 events");

    await user.click(screen.getByRole("button", { name: "New event" }));
    await user.type(
      within(await screen.findByRole("dialog")).getByLabelText("Name"),
      "Harvest Gala",
    );
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/events",
        expect.objectContaining({
          body: expect.objectContaining({ name: "Harvest Gala" }),
        }),
      ),
    );
  });

  it("hides the create action without the create grant", async () => {
    setup(access());
    await screen.findByText("2 events");
    expect(
      screen.queryByRole("button", { name: "New event" }),
    ).not.toBeInTheDocument();
  });

  it("shows a recoverable error state when the list request fails", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/events")
        return { data: undefined, response: { status: 500 } };
      return ok({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    setup();
    expect(
      await screen.findByText("We could not load the data. Try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("opens a row and deletes it via the API", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    setup(access("event.delete"));
    await screen.findByText("2 events");

    await user.click(
      screen.getAllByRole("button", { name: "Aurora Premiere" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Aurora Premiere" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete event" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/events/{id}",
        expect.objectContaining({ params: { path: { id: "e1" } } }),
      ),
    );
  });
});
