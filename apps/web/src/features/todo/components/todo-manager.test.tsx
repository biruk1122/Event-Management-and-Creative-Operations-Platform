import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type {
  ConnectRealtime,
  RealtimeConnectionListener,
  RealtimeConnectionState,
} from "@/features/realtime";

import { TodoManager } from "./todo-manager";
import type { TodoItem } from "../lib/todo-types";

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const TODAY = "2026-09-16";

const access: CurrentAccess = {
  userId: "viewer-1",
  grants: [
    { permissionKey: "todo.read", scope: "SELF" },
    { permissionKey: "todo.create", scope: "SELF" },
    { permissionKey: "todo.update", scope: "SELF" },
    { permissionKey: "todo.delete", scope: "SELF" },
  ],
};

function item(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "todo-1",
    title: "Confirm venue availability",
    description: null,
    type: "WORK",
    priority: "HIGH",
    status: "NOT_STARTED",
    dueDate: TODAY,
    dueTime: "09:00:00",
    relatedEventId: null,
    relatedProjectId: null,
    reminderEnabled: false,
    reminderAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A controllable fake connection, mirroring calendar-manager.test.tsx's own. */
function fakeConnect() {
  const listeners: RealtimeConnectionListener[] = [];
  const connect: ConnectRealtime = (listener) => {
    listeners.push(listener);
    return () => {};
  };
  return {
    connect,
    emit: (state: RealtimeConnectionState) =>
      listeners[listeners.length - 1]?.(state),
  };
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });
const failed = (status: number) => ({
  data: undefined,
  response: { ok: false, status },
});

function mockGetRoutes(routes: Record<string, unknown>) {
  get.mockImplementation((path: string) =>
    Promise.resolve(ok(routes[path] ?? { items: [] })),
  );
}

afterEach(() => vi.resetAllMocks());

function setup(fake = fakeConnect()) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TodoManager
        access={access}
        connect={fake.connect}
        initialToday={TODAY}
      />
    </QueryClientProvider>,
  );
  return { user, fake, client };
}

describe("TodoManager", () => {
  it("shows a loading state, then the My Day view with only today's item from the real API", async () => {
    let resolveGet: (value: unknown) => void = () => {};
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/todos") {
        return new Promise((resolve) => {
          resolveGet = resolve;
        });
      }
      return Promise.resolve(ok({ items: [] }));
    });
    setup();

    expect(screen.getByText("Loading your to-dos…")).toBeVisible();
    resolveGet(
      ok({
        items: [
          item(),
          item({
            id: "todo-2",
            title: "Buy anniversary gift",
            priority: "LOW",
            dueDate: "2026-09-20",
          }),
        ],
      }),
    );

    expect(await screen.findByText("Confirm venue availability")).toBeVisible();
    expect(screen.queryByText("Buy anniversary gift")).not.toBeInTheDocument();
  });

  it("switches to Upcoming and shows the future, not-yet-completed item", async () => {
    mockGetRoutes({
      "/api/v1/todos": {
        items: [
          item(),
          item({
            id: "todo-2",
            title: "Buy anniversary gift",
            priority: "LOW",
            dueDate: "2026-09-20",
          }),
        ],
      },
    });
    const { user } = setup();
    await screen.findByText("Confirm venue availability");

    await user.click(screen.getByRole("button", { name: "Upcoming" }));

    expect(screen.getByText("Buy anniversary gift")).toBeVisible();
    expect(
      screen.queryByText("Confirm venue availability"),
    ).not.toBeInTheDocument();
  });

  it("shows an undated, non-Work/Personal, non-important item only under All", async () => {
    mockGetRoutes({
      "/api/v1/todos": {
        items: [
          item({
            id: "todo-3",
            title: "Follow up with sponsor",
            type: "FOLLOW_UP",
            priority: "MEDIUM",
            dueDate: null,
            dueTime: null,
          }),
        ],
      },
    });
    const { user } = setup();
    await screen.findByText("Nothing due today.");

    for (const view of [
      "Upcoming",
      "Important",
      "Work",
      "Personal",
      "Completed",
    ]) {
      await user.click(screen.getByRole("button", { name: view }));
      expect(
        screen.queryByText("Follow up with sponsor"),
      ).not.toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Follow up with sponsor")).toBeVisible();
  });

  it("toggles an item's status through a minimal status-only PATCH", async () => {
    mockGetRoutes({ "/api/v1/todos": { items: [item()] } });
    patch.mockResolvedValue(ok({ ...item(), status: "COMPLETED" }));
    const { user } = setup();
    await screen.findByText("Confirm venue availability");

    await user.click(
      screen.getByRole("button", {
        name: 'Mark "Confirm venue availability" as completed',
      }),
    );

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/todos/{id}",
        expect.objectContaining({
          params: { path: { id: "todo-1" } },
          body: { status: "COMPLETED" },
        }),
      ),
    );
  });

  it("edits an item through the real API", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/api/v1/todos") {
        return Promise.resolve(ok({ items: [item()] }));
      }
      return Promise.resolve(ok({ items: [] }));
    });
    patch.mockResolvedValue(
      ok({ ...item(), title: "Confirm venue and catering" }),
    );
    const { user } = setup();
    await screen.findByText("Confirm venue availability");

    await user.click(screen.getByText("Confirm venue availability"));
    const dialog = screen.getByRole("dialog");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Confirm venue and catering");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const call = patch.mock.calls[0] as [string, { body: object }];
    expect(call[0]).toBe("/api/v1/todos/{id}");
    expect(call[1].body).toMatchObject({ title: "Confirm venue and catering" });
  });

  it("shows the not-found error when editing an item deleted elsewhere", async () => {
    mockGetRoutes({ "/api/v1/todos": { items: [item()] } });
    patch.mockResolvedValue({
      data: undefined,
      error: { code: "TODO_NOT_FOUND", status: 404 },
      response: { ok: false, status: 404 },
    });
    const { user } = setup();
    await screen.findByText("Confirm venue availability");

    await user.click(screen.getByText("Confirm venue availability"));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText(
        "This to-do no longer exists. It may already have been changed or removed elsewhere.",
      ),
    ).toBeVisible();
  });

  it("deletes an item through the real API", async () => {
    get
      .mockImplementationOnce(() => Promise.resolve(ok({ items: [item()] })))
      .mockImplementation(() => Promise.resolve(ok({ items: [] })));
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const { user } = setup();
    await screen.findByText("Confirm venue availability");

    await user.click(screen.getByText("Confirm venue availability"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/todos/{id}",
        expect.objectContaining({ params: { path: { id: "todo-1" } } }),
      ),
    );
    expect(
      screen.queryByText("Confirm venue availability"),
    ).not.toBeInTheDocument();
  });

  it("creates a new to-do through the real API via the toolbar's Add to-do action", async () => {
    const created = item({ id: "todo-9", title: "Book caterer" });
    mockGetRoutes({ "/api/v1/todos": { items: [] } });
    post.mockResolvedValue(ok(created));
    const { user } = setup();
    await screen.findByRole("button", { name: "Add to-do" });

    await user.click(screen.getByRole("button", { name: "Add to-do" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Book caterer");
    fireEvent.change(within(dialog).getByLabelText("Due date (optional)"), {
      target: { value: TODAY },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create to-do" }),
    );

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const call = post.mock.calls[0] as [string, { body: { title: string } }];
    expect(call[0]).toBe("/api/v1/todos");
    expect(call[1].body).toMatchObject({ title: "Book caterer" });
  });

  it("offers related event and project options sourced from the real API", async () => {
    mockGetRoutes({
      "/api/v1/todos": { items: [] },
      "/api/v1/events": { items: [{ id: "event-1", name: "Q4 launch event" }] },
      "/api/v1/projects": {
        items: [{ id: "project-1", name: "Brand refresh" }],
      },
    });
    const { user } = setup();
    await screen.findByRole("button", { name: "Add to-do" });

    await user.click(screen.getByRole("button", { name: "Add to-do" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByLabelText("Related event (optional)"));
    expect(
      await screen.findByRole("option", { name: "Q4 launch event" }),
    ).toBeVisible();
  });

  it("shows an error state with a retry action when the feed fails to load", async () => {
    get.mockImplementation((path: string) =>
      path === "/api/v1/todos"
        ? Promise.resolve(failed(500))
        : Promise.resolve(ok({ items: [] })),
    );
    const { user } = setup();

    expect(
      await screen.findByText("We could not load your to-dos. Try again."),
    ).toBeVisible();

    get.mockImplementation(() => Promise.resolve(ok({ items: [item()] })));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Confirm venue availability")).toBeVisible();
  });

  it("shows a reconnecting banner while the live connection drops", async () => {
    mockGetRoutes({ "/api/v1/todos": { items: [] } });
    const { fake } = setup();
    await screen.findByRole("button", { name: "Add to-do" });

    fake.emit({ status: "reconnecting", detail: null, rooms: [] });

    expect(await screen.findByText("Reconnecting…")).toBeVisible();
  });

  it("reconciles (refetches) the to-do list after reconnecting, but not on the first connect", async () => {
    mockGetRoutes({ "/api/v1/todos": { items: [] } });
    const { fake } = setup();
    await screen.findByRole("button", { name: "Add to-do" });
    const callsAfterFirstLoad = get.mock.calls.length;

    fake.emit({ status: "connected", detail: null, rooms: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(get.mock.calls.length).toBe(callsAfterFirstLoad);

    fake.emit({ status: "reconnecting", detail: null, rooms: [] });
    fake.emit({ status: "connected", detail: null, rooms: [] });

    await waitFor(() =>
      expect(get.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad),
    );
  });
});
