import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { MeetingsManager } from "./meetings-manager";

const { get, put, post, patch, del, searchParams } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  searchParams: { value: "" },
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, PUT: put, POST: post, PATCH: patch, DELETE: del },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token" }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));

const access: CurrentAccess = {
  userId: "user-1",
  grants: [
    { permissionKey: "meeting.read", scope: "SELF" },
    { permissionKey: "meeting.respond", scope: "SELF" },
  ],
};

const meeting = {
  id: "meeting-1",
  workspaceId: null,
  title: "Venue review",
  description: "Review the final venue plan.",
  type: "HYBRID" as const,
  status: "SCHEDULED" as const,
  organizer: {
    id: "organizer-1",
    email: "organizer@example.com",
    firstName: "Aster",
    lastName: "Bekele",
  },
  startAt: "2026-10-10T09:00:00.000Z",
  endAt: "2026-10-10T10:00:00.000Z",
  location: "Studio A",
  reminderAt: null,
  participants: [
    {
      id: "user-1",
      email: "user@example.com",
      firstName: "Biruk",
      lastName: null,
      response: "PENDING" as const,
      respondedAt: null,
      invitedAt: "2026-10-01T09:00:00.000Z",
    },
  ],
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

function setup(currentAccess = access) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MeetingsManager access={currentAccess} connect={() => () => undefined} />
    </QueryClientProvider>,
  );
  return client;
}

describe("MeetingsManager", () => {
  beforeEach(() => {
    searchParams.value = "";
    del.mockReset();
    put.mockReset();
    patch.mockReset();
    post.mockReset();
    get.mockResolvedValue({
      data: { items: [meeting], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: {
        meetingId: meeting.id,
        response: "ACCEPTED",
        respondedAt: "2026-10-02T09:00:00.000Z",
      },
      response: { status: 200 },
    });
  });

  const organizerAccess: CurrentAccess = {
    userId: meeting.organizer.id,
    grants: [
      { permissionKey: "meeting.read", scope: "ORGANIZATION" },
      { permissionKey: "meeting.update", scope: "ORGANIZATION" },
    ],
  };

  it("switches between upcoming and past meetings without losing the loaded list", async () => {
    const user = userEvent.setup();
    const future = {
      ...meeting,
      id: "future-meeting",
      title: "Next planning meeting",
      startAt: "2099-10-10T09:00:00.000Z",
      endAt: "2099-10-10T10:00:00.000Z",
    };
    const cancelled = {
      ...future,
      id: "cancelled",
      title: "Cancelled planning",
      status: "CANCELLED",
    };
    get.mockResolvedValue({
      data: {
        items: [meeting, future, cancelled],
        page: 1,
        pageSize: 25,
        total: 3,
      },
      response: { status: 200 },
    });
    setup();
    expect(
      await screen.findByRole("heading", { name: future.title }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Upcoming" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: new RegExp(cancelled.title) }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Past" }));
    expect(screen.getByRole("heading", { name: meeting.title })).toBeVisible();
    expect(
      screen.getByRole("button", { name: new RegExp(cancelled.title) }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(screen.getByRole("heading", { name: future.title })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("shows participant details through an accessible disclosure", async () => {
    const user = userEvent.setup();
    setup();
    const trigger = await screen.findByRole("button", {
      name: "View participants",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Biruk")).not.toBeVisible();
    await user.click(trigger);
    expect(screen.getByText("Biruk")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Hide participants" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the notes editor and preserves its draft after a failed save", async () => {
    const user = userEvent.setup();
    put.mockResolvedValueOnce({ data: undefined, response: { status: 403 } });
    setup(organizerAccess);
    await user.click(
      await screen.findByRole("button", { name: "Add meeting notes" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Meeting notes" }),
      "Confirm the venue booking.",
    );
    await user.click(
      screen.getByRole("button", { name: "Save meeting notes" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "do not have access",
    );
    expect(screen.getByRole("textbox", { name: "Meeting notes" })).toHaveValue(
      "Confirm the venue booking.",
    );
    expect(put).toHaveBeenCalledWith(
      "/api/v1/meetings/{id}/minutes",
      expect.objectContaining({
        body: { minutes: "Confirm the venue booking." },
        headers: { "x-csrf-token": "csrf-token" },
      }),
    );
  });

  it("saves meeting notes and returns to the notes preview", async () => {
    const user = userEvent.setup();
    let current = { ...meeting, minutes: null as string | null };
    get.mockImplementation(async () => ({
      data: { items: [current], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    }));
    put.mockImplementation(async (_path, options) => {
      current = { ...current, minutes: options.body.minutes };
      return { data: current, response: { status: 200 } };
    });
    setup(organizerAccess);
    await user.click(
      await screen.findByRole("button", { name: "Add meeting notes" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Meeting notes" }),
    ).toHaveFocus();
    await user.type(
      screen.getByRole("textbox", { name: "Meeting notes" }),
      "Budget approved.",
    );
    await user.click(
      screen.getByRole("button", { name: "Save meeting notes" }),
    );
    expect(await screen.findByText("Budget approved.")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Meeting notes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit meeting notes" }),
    ).toHaveFocus();
  });

  it("edits a completed meeting and refreshes its title without changing its status", async () => {
    const user = userEvent.setup();
    let current = { ...meeting, status: "COMPLETED" };
    get.mockImplementation(async (path: string) => ({
      data:
        path === "/api/v1/meetings/{id}"
          ? current
          : { items: [current], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    }));
    patch.mockImplementation(async (_path, options) => {
      current = { ...current, ...options.body };
      return { data: current, response: { status: 200 } };
    });
    const client = setup(organizerAccess);
    const calendarKey = ["calendar", organizerAccess.userId, "cached-range"];
    client.setQueryData(calendarKey, { items: [] });
    await user.click(
      await screen.findByRole("button", { name: "Edit meeting" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Meeting title")).toHaveValue(meeting.title);
    await user.clear(dialog.getByLabelText("Meeting title"));
    await user.type(
      dialog.getByLabelText("Meeting title"),
      "Updated venue review",
    );
    await user.clear(dialog.getByLabelText("Description (optional)"));
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/meetings/{id}",
      expect.objectContaining({
        params: { path: { id: meeting.id } },
        headers: { "x-csrf-token": "csrf-token" },
        body: expect.objectContaining({
          title: "Updated venue review",
          description: null,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
        }),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Updated venue review" }),
    ).toBeVisible();
    expect(screen.getAllByText("Completed", { exact: true })[0]).toBeVisible();
    expect(client.getQueryState(calendarKey)?.isInvalidated).toBe(true);
  });

  it("lets an organizer correct a reminder when rescheduling earlier", async () => {
    const user = userEvent.setup();
    const withReminder = { ...meeting, reminderAt: "2026-10-10T08:45:00.000Z" };
    get.mockResolvedValue({
      data: { items: [withReminder], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    });
    patch.mockResolvedValue({ data: withReminder, response: { status: 200 } });
    setup(organizerAccess);
    await user.click(
      await screen.findByRole("button", { name: "Edit meeting" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Reminder (optional)")).not.toHaveValue("");
    fireEvent.change(dialog.getByLabelText("Start time"), {
      target: { value: "2026-10-10T08:00:00" },
    });
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Set the reminder at or before",
    );
    expect(patch).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Reminder (optional)"), {
      target: { value: "2026-10-10T07:45:00" },
    });
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/meetings/{id}",
      expect.objectContaining({
        body: expect.objectContaining({
          reminderAt: new Date("2026-10-10T07:45:00").toISOString(),
        }),
      }),
    );
  });

  it("keeps an edit draft when saving fails", async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ response: { status: 400 } });
    setup(organizerAccess);
    await user.click(
      await screen.findByRole("button", { name: "Edit meeting" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("Meeting title"));
    await user.type(dialog.getByLabelText("Meeting title"), "Keep this draft");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Check the meeting dates",
    );
    expect(dialog.getByLabelText("Meeting title")).toHaveValue(
      "Keep this draft",
    );
  });

  it("requires confirmation and removes a deep-linked meeting without restoring its stale detail", async () => {
    const user = userEvent.setup();
    searchParams.value = `meetingId=${meeting.id}`;
    let removed = false;
    let deletedDetailReads = 0;
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/meetings/{id}") {
        if (removed) deletedDetailReads++;
        return { data: meeting, response: { status: 200 } };
      }
      return {
        data: {
          items: removed ? [] : [meeting],
          page: 1,
          pageSize: 25,
          total: removed ? 0 : 1,
        },
        response: { status: 200 },
      };
    });
    del.mockImplementation(async () => {
      removed = true;
      return { response: new Response(null, { status: 204 }) };
    });
    const client = setup(organizerAccess);
    const calendarKey = ["calendar", organizerAccess.userId, "cached-range"];
    const notificationKey = [
      "notifications",
      organizerAccess.userId,
      "unread-count",
    ];
    const otherUserKey = ["calendar", "another-user", "cached-range"];
    client.setQueryData(calendarKey, { items: [] });
    client.setQueryData(notificationKey, 1);
    client.setQueryData(otherUserKey, { items: [] });
    const trigger = await screen.findByRole("button", {
      name: "Remove meeting",
    });
    await user.click(trigger);
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Keep meeting" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep meeting" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Yes, remove meeting" }),
    );
    expect(
      await screen.findByRole("heading", { name: "No meetings to show" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: meeting.title }),
    ).not.toBeInTheDocument();
    expect(deletedDetailReads).toBe(0);
    expect(client.getQueryState(calendarKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(notificationKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherUserKey)?.isInvalidated).toBe(false);
    expect(del).toHaveBeenCalledExactlyOnceWith("/api/v1/meetings/{id}", {
      params: { path: { id: meeting.id } },
      headers: { "x-csrf-token": "csrf-token" },
    });
  });

  it("keeps the meeting and confirmation open if deletion fails", async () => {
    const user = userEvent.setup();
    del.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    setup(organizerAccess);
    await user.click(
      await screen.findByRole("button", { name: "Remove meeting" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Yes, remove meeting" }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent("do not have access");
    await user.click(screen.getByRole("button", { name: "Keep meeting" }));
    expect(screen.getByRole("heading", { name: meeting.title })).toBeVisible();
  });

  it("hides editing and removal from a non-organizer even with an update grant", async () => {
    setup({ ...organizerAccess, userId: "another-user" });
    await screen.findByRole("heading", { name: meeting.title });
    expect(
      screen.queryByRole("button", { name: "Edit meeting" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove meeting" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer creation without a department or organization create grant", async () => {
    setup({
      ...access,
      grants: [
        ...access.grants,
        { permissionKey: "meeting.create", scope: "SELF" },
      ],
    });
    await screen.findByRole("heading", { name: "Venue review" });
    expect(
      screen.queryByRole("button", { name: "Create meeting" }),
    ).not.toBeInTheDocument();
  });

  it("offers the user directory in the searchable participant picker when user.read is granted", async () => {
    const user = userEvent.setup();
    get.mockImplementation(async (path: string) => ({
      data:
        path === "/api/v1/users"
          ? {
              items: [
                {
                  id: "colleague-1",
                  email: "colleague@example.com",
                  firstName: "Cole",
                  lastName: "League",
                },
                // The current user themself must never appear as a candidate.
                {
                  ...meeting.organizer,
                  id: access.userId,
                  email: "self@example.com",
                },
              ],
              page: 1,
              pageSize: 100,
              total: 2,
            }
          : { items: [], page: 1, pageSize: 25, total: 0 },
      response: { status: 200 },
    }));
    setup({
      ...access,
      grants: [
        ...access.grants,
        { permissionKey: "meeting.create", scope: "ORGANIZATION" },
        { permissionKey: "user.read", scope: "ORGANIZATION" },
      ],
    });
    await screen.findByRole("heading", { name: "No meetings to show" });
    await user.click(screen.getByRole("button", { name: "Create meeting" }));
    await user.click(screen.getByLabelText("Participants (optional)"));
    expect(
      await screen.findByRole("button", { name: "Cole League" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("self@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByText("The user directory is unavailable for your role."),
    ).not.toBeInTheDocument();
  });

  it("creates from the empty state with CSRF and selects a meeting outside the current page", async () => {
    const user = userEvent.setup();
    const created = {
      ...meeting,
      id: "created-1",
      title: "Planning session",
      type: "ONLINE",
      location: null,
      organizer: { ...meeting.organizer, id: access.userId },
      participants: [],
    };
    get.mockImplementation(async (path: string) => ({
      data:
        path === "/api/v1/meetings/{id}"
          ? created
          : { items: [], page: 1, pageSize: 25, total: 0 },
      response: { status: 200 },
    }));
    post.mockResolvedValue({ data: created, response: { status: 201 } });
    setup({
      ...access,
      grants: [
        ...access.grants,
        { permissionKey: "meeting.create", scope: "ORGANIZATION" },
      ],
    });
    await screen.findByRole("heading", { name: "No meetings to show" });
    await user.click(screen.getByRole("button", { name: "Create meeting" }));
    await user.type(screen.getByLabelText("Meeting title"), "Planning session");
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "2026-10-20T09:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "2026-10-20T10:00" },
    });
    await user.click(screen.getByRole("combobox", { name: "Meeting type" }));
    await user.click(await screen.findByRole("option", { name: "Online" }));
    await user.click(screen.getByRole("button", { name: "Create meeting" }));
    expect(
      await screen.findByRole("heading", { name: "Planning session" }),
    ).toBeVisible();
    expect(post).toHaveBeenCalledWith("/api/v1/meetings", {
      headers: { "x-csrf-token": "csrf-token" },
      body: {
        title: "Planning session",
        type: "ONLINE",
        participantIds: [],
        startAt: new Date("2026-10-20T09:00").toISOString(),
        endAt: new Date("2026-10-20T10:00").toISOString(),
      },
    });
    expect(
      screen.getByRole("button", { name: "Join meeting" }),
    ).toBeInTheDocument();
  });

  it("joins an organized online meeting and mounts the Jitsi room", async () => {
    const user = userEvent.setup();
    const organized = {
      ...meeting,
      type: "ONLINE" as const,
      organizer: { ...meeting.organizer, id: access.userId },
    };
    const jitsiApi = {
      addEventListener: vi.fn(),
      executeCommand: vi.fn(),
      dispose: vi.fn(),
    };
    const JitsiMeetExternalAPI = vi.fn(() => jitsiApi);
    window.JitsiMeetExternalAPI = JitsiMeetExternalAPI as never;
    // jsdom never actually fetches/executes an injected <script> tag -
    // simulate the browser firing its load event immediately, since
    // `window.JitsiMeetExternalAPI` is already present above.
    const appendSpy = vi
      .spyOn(document.head, "append")
      .mockImplementation((...nodes) => {
        for (const node of nodes) {
          if (node instanceof HTMLScriptElement)
            node.onload?.(new Event("load"));
        }
        return undefined as never;
      });
    get.mockImplementation(async (path: string) => ({
      data: path.endsWith("/jitsi-session")
        ? {
            domain: "meet.example.test",
            roomName: "lela-meeting-1",
            displayName: "Biruk",
            moderator: true,
            jwt: null,
          }
        : { items: [organized], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    }));
    setup({
      ...access,
      grants: [
        ...access.grants,
        { permissionKey: "meeting.update", scope: "ORGANIZATION" },
      ],
    });
    await screen.findByRole("heading", { name: "Venue review" });
    await user.click(screen.getByRole("button", { name: "Join meeting" }));
    await waitFor(() => expect(JitsiMeetExternalAPI).toHaveBeenCalledTimes(1));
    expect(JitsiMeetExternalAPI).toHaveBeenCalledWith(
      "meet.example.test",
      expect.objectContaining({ roomName: "lela-meeting-1" }),
    );
    expect(
      await screen.findByRole("button", { name: "End meeting for everyone" }),
    ).toBeInTheDocument();
    appendSpy.mockRestore();
    delete (window as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
  });

  it("drives meeting details and a durable invitation response from the REST API", async () => {
    const user = userEvent.setup();
    setup();
    expect(
      await screen.findByRole("heading", { name: "Venue review" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(
      "/api/v1/meetings/{id}/response",
      expect.objectContaining({
        params: { path: { id: "meeting-1" } },
        body: { response: "ACCEPTED" },
        headers: { "x-csrf-token": "csrf-token" },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "marked accepted",
    );
  });

  it("preserves the response controls after a recoverable API failure", async () => {
    const user = userEvent.setup();
    put.mockResolvedValueOnce({ data: undefined, response: { status: 409 } });
    setup();
    await screen.findByRole("heading", { name: "Venue review" });
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "already been answered",
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  it("selects the meeting named by a ?meetingId= deep link, even off the loaded page", async () => {
    const deepLinked = {
      ...meeting,
      id: "meeting-2",
      title: "Sponsor check-in",
    };
    searchParams.value = "meetingId=meeting-2";
    get.mockImplementation(async (path: string) => ({
      data:
        path === "/api/v1/meetings/{id}"
          ? deepLinked
          : { items: [meeting], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    }));
    setup();
    expect(
      await screen.findByRole("heading", { name: "Sponsor check-in" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Venue review" }),
    ).not.toBeInTheDocument();
  });

  it("loads the next page of meetings on demand, past the first page", async () => {
    const user = userEvent.setup();
    const older = { ...meeting, id: "meeting-2", title: "Sponsor check-in" };
    get
      .mockResolvedValueOnce({
        data: { items: [meeting], page: 1, pageSize: 25, total: 26 },
        response: { status: 200 },
      })
      .mockResolvedValueOnce({
        data: { items: [older], page: 2, pageSize: 25, total: 26 },
        response: { status: 200 },
      });
    setup();

    await screen.findByRole("heading", { name: "Venue review" });
    expect(screen.queryByText("Sponsor check-in")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Load more meetings" }),
    );

    expect(await screen.findByText("Sponsor check-in")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Load more meetings" }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/meetings",
      expect.objectContaining({
        params: { query: { page: 2, pageSize: 25 } },
      }),
    );
  });
});
