import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type {
  ConnectRealtime,
  RealtimeConnectionListener,
  RealtimeConnectionState,
} from "@/features/realtime";

import { CalendarManager } from "./calendar-manager";
import type { CalendarEntry } from "../lib/calendar-types";

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

const ANCHOR = new Date(2026, 8, 16); // a Wednesday

const access: CurrentAccess = {
  userId: "viewer-1",
  grants: [
    { permissionKey: "calendar.read", scope: "SELF" },
    { permissionKey: "calendar.create", scope: "SELF" },
    { permissionKey: "calendar.update", scope: "SELF" },
    { permissionKey: "calendar.delete", scope: "SELF" },
  ],
};

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "event-1",
    title: "Q4 launch event",
    description: "Venue walkthrough.",
    type: "EVENT",
    startAt: new Date(2026, 8, 16, 10).toISOString(),
    endAt: new Date(2026, 8, 16, 12).toISOString(),
    eventId: "event-record-1",
    taskId: null,
    projectId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function personalEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return entry({
    id: "personal-1",
    title: "Dentist appointment",
    description: null,
    type: "PERSONAL",
    startAt: new Date(2026, 8, 16, 15, 30).toISOString(),
    endAt: null,
    eventId: null,
    ...overrides,
  });
}

/** A controllable fake connection, mirroring notifications-manager.test.tsx's own. */
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

afterEach(() => vi.resetAllMocks());

function setup(fake = fakeConnect()) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarManager
        access={access}
        connect={fake.connect}
        initialAnchor={ANCHOR}
      />
    </QueryClientProvider>,
  );
  return { user, fake, client };
}

describe("CalendarManager", () => {
  it("shows a loading state, then the month view with entries from the real API", async () => {
    let resolveGet: (value: unknown) => void = () => {};
    get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
    );
    setup();

    expect(screen.getByText("Loading your calendar…")).toBeVisible();
    resolveGet(ok({ items: [entry(), personalEntry()] }));

    expect(await screen.findByText("Q4 launch event")).toBeVisible();
    expect(screen.getByText("Dentist appointment")).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/calendar",
      expect.objectContaining({
        params: {
          query: { from: expect.any(String), to: expect.any(String) },
        },
      }),
    );
  });

  it("switches to week, day, and agenda views and keeps showing the data", async () => {
    get.mockResolvedValue(ok({ items: [entry(), personalEntry()] }));
    const { user } = setup();
    await screen.findByText("Q4 launch event");

    await user.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();
    expect(screen.getByText("Dentist appointment")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Agenda" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();
  });

  it("hides a type's entries when its filter is unchecked", async () => {
    get.mockResolvedValue(ok({ items: [entry(), personalEntry()] }));
    const { user } = setup();
    await screen.findByText("Q4 launch event");

    await user.click(screen.getByRole("checkbox", { name: "Event entries" }));

    expect(screen.queryByText("Q4 launch event")).not.toBeInTheDocument();
    expect(screen.getByText("Dentist appointment")).toBeVisible();
  });

  it("opens the read-only detail view for a projected entry, not an edit form", async () => {
    get.mockResolvedValue(ok({ items: [entry()] }));
    const { user } = setup();
    await screen.findByText("Q4 launch event");

    await user.click(screen.getByText("Q4 launch event"));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "This entry is managed by its event record, not from the calendar.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("edits a mutable entry through the real API without sending its type", async () => {
    get
      .mockResolvedValueOnce(ok({ items: [personalEntry()] }))
      .mockResolvedValueOnce(
        ok({ items: [{ ...personalEntry(), title: "Dentist follow-up" }] }),
      );
    patch.mockResolvedValue(
      ok({ ...personalEntry(), title: "Dentist follow-up" }),
    );
    const { user } = setup();
    await screen.findByText("Dentist appointment");

    await user.click(screen.getByText("Dentist appointment"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Type")).toBeDisabled();
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Dentist follow-up");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const call = patch.mock.calls[0] as [string, { body: object }];
    expect(call[0]).toBe("/api/v1/calendar/{id}");
    expect(call[1].body).not.toHaveProperty("type");
    expect(await screen.findByText("Dentist follow-up")).toBeVisible();
  });

  it("shows the not-found error when editing an entry deleted elsewhere", async () => {
    get.mockResolvedValue(ok({ items: [personalEntry()] }));
    patch.mockResolvedValue({
      data: undefined,
      error: { code: "CALENDAR_ENTRY_NOT_FOUND", status: 404 },
      response: { ok: false, status: 404 },
    });
    const { user } = setup();
    await screen.findByText("Dentist appointment");

    await user.click(screen.getByText("Dentist appointment"));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText(
        "This entry no longer exists. It may already have been changed or removed elsewhere.",
      ),
    ).toBeVisible();
  });

  it("deletes a mutable entry through the real API", async () => {
    get
      .mockResolvedValueOnce(ok({ items: [personalEntry()] }))
      .mockResolvedValueOnce(ok({ items: [] }));
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const { user } = setup();
    await screen.findByText("Dentist appointment");

    await user.click(screen.getByText("Dentist appointment"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/calendar/{id}",
        expect.objectContaining({ params: { path: { id: "personal-1" } } }),
      ),
    );
    expect(screen.queryByText("Dentist appointment")).not.toBeInTheDocument();
  });

  it("creates a new entry through the real API via the toolbar's Add entry action", async () => {
    const created = { ...personalEntry(), id: "personal-2", title: "Vet visit" };
    get
      .mockResolvedValueOnce(ok({ items: [] }))
      .mockResolvedValueOnce(ok({ items: [created] }));
    post.mockResolvedValue(ok(created));
    const { user } = setup();
    await screen.findByRole("button", { name: "Add entry" });

    await user.click(screen.getByRole("button", { name: "Add entry" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Vet visit");
    await user.click(
      within(dialog).getByRole("button", { name: "Create entry" }),
    );

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const call = post.mock.calls[0] as [string, { body: { type: string } }];
    expect(call[0]).toBe("/api/v1/calendar");
    expect(call[1].body).toMatchObject({
      title: "Vet visit",
      type: "PERSONAL",
    });
    expect(await screen.findByText("Vet visit")).toBeVisible();
  });

  it("navigating to the next month requests a different range from the API", async () => {
    get.mockResolvedValue(ok({ items: [] }));
    const { user } = setup();
    await screen.findByText("September 2026");
    const initialQuery = get.mock.calls[0]?.[1]?.params?.query as {
      from: string;
      to: string;
    };

    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByText("October 2026")).toBeVisible();
    await waitFor(() => {
      const latestQuery = get.mock.calls.at(-1)?.[1]?.params?.query as {
        from: string;
        to: string;
      };
      expect(latestQuery.from).not.toBe(initialQuery.from);
    });
  });

  it("shows an error state with a retry action when the feed fails to load", async () => {
    get.mockResolvedValue(failed(500));
    const { user } = setup();

    expect(
      await screen.findByText("We could not load your calendar. Try again."),
    ).toBeVisible();

    get.mockResolvedValue(ok({ items: [personalEntry()] }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Dentist appointment")).toBeVisible();
  });

  it("shows a reconnecting banner while the live connection drops", async () => {
    get.mockResolvedValue(ok({ items: [] }));
    const { fake } = setup();
    await screen.findByRole("button", { name: "Add entry" });

    fake.emit({ status: "reconnecting", detail: null, rooms: [] });

    expect(await screen.findByText("Reconnecting…")).toBeVisible();
  });

  it("shows a live-updates-unavailable notice when the connection is denied", async () => {
    get.mockResolvedValue(ok({ items: [] }));
    const { fake } = setup();
    await screen.findByRole("button", { name: "Add entry" });

    fake.emit({ status: "denied", detail: "Sign in again.", rooms: [] });

    expect(
      await screen.findByText(
        "Live updates are unavailable. Refresh to see changes made elsewhere.",
      ),
    ).toBeVisible();
  });

  it("reconciles (refetches) the calendar after reconnecting, but not on the first connect", async () => {
    get.mockResolvedValue(ok({ items: [] }));
    const { fake } = setup();
    await screen.findByRole("button", { name: "Add entry" });
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
