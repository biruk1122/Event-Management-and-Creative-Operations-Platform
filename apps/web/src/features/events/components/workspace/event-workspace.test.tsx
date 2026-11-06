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
import type { Event, EventMilestone } from "../../lib/events-types";
import { EventOverviewTab } from "./event-overview-tab";
import { EventPendingTab } from "./event-pending-tab";
import { EventWorkspaceShell } from "./event-workspace-shell";

const { get, post, patch, del, currentAccess, pathname } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  currentAccess: { value: null as unknown },
  pathname: { value: "/events/e1" },
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/features/auth/api/access-queries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCurrentAccess: () => ({
    data: currentAccess.value,
    isPending: false,
    isError: false,
  }),
}));

const now = "2026-09-01T09:00:00.000Z";

const EVENT: Event = {
  id: "e1",
  eventNumber: 24,
  workspaceId: "ws-1",
  name: "Addis Live 2026",
  eventType: "CONCERT",
  description: "A shared stage.",
  status: "IN_PROGRESS",
  startAt: "2026-10-24T17:00:00.000Z",
  endAt: "2026-10-24T23:00:00.000Z",
  reminderAt: null,
  location: "Millennium Hall",
  organizerName: null,
  departmentId: null,
  manager: {
    id: "u1",
    email: "hana@example.com",
    firstName: "Hana",
    lastName: "Bekele",
  },
  teams: [],
  participants: [],
  createdBy: null,
  progress: { completed: 28, total: 36 },
  createdAt: now,
  updatedAt: now,
};

const MILESTONE: EventMilestone = {
  id: "m1",
  eventId: "e1",
  name: "Doors open",
  description: null,
  dueDate: "2026-10-24",
  status: "IN_PROGRESS",
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

function access(...keys: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["event.read", ...keys].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

function serveWorkspace(event: Event | null = EVENT) {
  get.mockImplementation(async (path: string) => {
    switch (path) {
      case "/api/v1/events/{id}":
        return event
          ? ok(event)
          : { data: undefined, response: { ok: false, status: 404 } };
      case "/api/v1/events/{id}/overview":
        return ok({
          tasks: { total: 36, completed: 28, awaitingReview: 3 },
          teams: { count: 4, people: 18 },
          milestones: { total: 4, completed: 2 },
        });
      case "/api/v1/events/{id}/milestones":
        return ok([MILESTONE]);
      case "/api/v1/events/{id}/activity":
        return ok([
          {
            id: "a1",
            action: "event.status_changed",
            occurredAt: new Date(Date.now() - 12 * 60_000).toISOString(),
            actor: EVENT.manager,
            subject: "IN_PROGRESS",
          },
        ]);
      case "/api/v1/events/{id}/budget-summary":
        return ok({
          plannedAmount: "2500000.00",
          currency: "ETB",
          actualApproved: "1800000.00",
          actualPending: "0.00",
        });
      case "/api/v1/tasks":
        return ok({
          items: [
            {
              id: "t1",
              title: "Finalize stage plan",
              priority: "HIGH",
              status: "IN_PROGRESS",
              assignees: [EVENT.manager],
              dueAt: "2026-10-20T00:00:00.000Z",
              progress: 72,
            },
          ],
          page: 1,
          pageSize: 5,
          total: 1,
        });
      default:
        throw new Error(`Unexpected GET ${path}`);
    }
  });
}

function renderWorkspace(children = <EventOverviewTab />) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EventWorkspaceShell eventId="e1">{children}</EventWorkspaceShell>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentAccess.value = access();
  pathname.value = "/events/e1";
  serveWorkspace();
});

describe("Event workspace", () => {
  it("shows the event header, reference and all seven tabs", async () => {
    renderWorkspace();

    const summary = await screen.findByRole("region", {
      name: "Event summary",
    });
    expect(within(summary).getByText("Concert / EVT-024")).toBeVisible();
    expect(
      within(summary).getByRole("heading", { name: "Addis Live 2026" }),
    ).toBeVisible();
    expect(
      within(summary).getByText(
        "Oct 24, 20:00 – Oct 25, 02:00 · Millennium Hall",
      ),
    ).toBeVisible();
    expect(within(summary).getByText("In progress")).toBeVisible();

    const tabs = screen.getByRole("navigation", { name: "Event workspace" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/events/e1",
      "/events/e1/details",
      "/events/e1/teams",
      "/events/e1/talents",
      "/events/e1/tasks",
      "/events/e1/calendar",
      "/events/e1/meetings",
    ]);
    expect(within(tabs).queryByText("Files")).not.toBeInTheDocument();
  });

  it("marks the tab for the current URL as active", async () => {
    pathname.value = "/events/e1/tasks";
    renderWorkspace(<EventPendingTab title="Tasks" />);

    const tabs = await screen.findByRole("navigation", {
      name: "Event workspace",
    });
    expect(within(tabs).getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(tabs).getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("offers Edit event only to a caller who can update", async () => {
    renderWorkspace();
    await screen.findByRole("region", { name: "Event summary" });
    expect(
      screen.queryByRole("link", { name: "Edit event" }),
    ).not.toBeInTheDocument();
  });

  it("links Edit event to the details form", async () => {
    currentAccess.value = access("event.update");
    renderWorkspace();
    expect(
      await screen.findByRole("link", { name: "Edit event" }),
    ).toHaveAttribute("href", "/events/e1/details?edit=1");
  });

  it("shows a clear state when the event cannot be read", async () => {
    serveWorkspace(null);
    renderWorkspace();
    expect(
      await screen.findByText(
        "This event does not exist, or you do not have access to it.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Event workspace" }),
    ).not.toBeInTheDocument();
  });

  it("denies a caller without event.read before loading anything", async () => {
    currentAccess.value = { userId: "operator-1", grants: [] };
    renderWorkspace();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Event overview", () => {
  it("fills the tiles from the API", async () => {
    currentAccess.value = access("event.budget.read");
    renderWorkspace();

    expect(await screen.findByText("78%")).toBeVisible();
    expect(screen.getByText("2 of 4 milestones complete")).toBeVisible();
    expect(screen.getByText("28 / 36")).toBeVisible();
    expect(screen.getByText("3 awaiting review")).toBeVisible();
    expect(screen.getByText("04")).toBeVisible();
    expect(screen.getByText("18 people connected")).toBeVisible();
    expect(await screen.findByText("Budget, ETB")).toBeVisible();
    expect(screen.getByText("2.5m")).toBeVisible();
    expect(screen.getByText("1.8m approved spend")).toBeVisible();
  });

  it("hides the budget tile without event.budget.read", async () => {
    renderWorkspace();
    await screen.findByText("78%");
    expect(screen.queryByText(/^Budget/)).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith(
      "/api/v1/events/{id}/budget-summary",
      expect.anything(),
    );
  });

  it("shows the event's activity with its actor", async () => {
    renderWorkspace();
    expect(await screen.findByText("Hana Bekele")).toBeVisible();
    expect(screen.getByText("moved the event to In progress")).toBeVisible();
    expect(screen.getByText("12 minutes ago")).toBeVisible();
  });

  it("asks the Tasks API for this event's attention tasks", async () => {
    currentAccess.value = access("task.read");
    renderWorkspace();

    expect(
      await screen.findByRole("link", { name: "Finalize stage plan" }),
    ).toHaveAttribute("href", "/tasks/t1");
    expect(get).toHaveBeenCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        params: {
          query: expect.objectContaining({
            relatedEventId: "e1",
            needsAttention: true,
            sort: "DUE_AT",
          }),
        },
      }),
    );
  });

  it("leaves tasks out for a caller without task.read", async () => {
    renderWorkspace();
    await screen.findByText("78%");
    expect(
      screen.queryByRole("heading", { name: "Tasks that need attention" }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry when the overview fails", async () => {
    get.mockImplementation(async (path: string) =>
      path === "/api/v1/events/{id}"
        ? ok(EVENT)
        : { data: undefined, response: { ok: false, status: 500 } },
    );
    renderWorkspace();
    expect(
      await screen.findByText("We could not load the data. Try again.", {
        selector: "div[role=alert] > p",
      }),
    ).toBeInTheDocument();
  });
});

describe("Event milestones", () => {
  it("lists milestones, read-only without event.update", async () => {
    renderWorkspace();
    expect(await screen.findByText("Doors open")).toBeVisible();
    expect(screen.getByText("Oct 24")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add milestone" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Doors open" }),
    ).not.toBeInTheDocument();
  });

  it("validates, then adds a milestone through the API", async () => {
    currentAccess.value = access("event.update");
    post.mockResolvedValue({ data: MILESTONE, response: { status: 201 } });
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      await screen.findByRole("button", { name: "Add milestone" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save milestone" }),
    );
    expect(await within(dialog).findByText("Enter a name.")).toBeVisible();
    expect(post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Name"), "Soundcheck");
    fireEvent.change(within(dialog).getByLabelText("Due date"), {
      target: { value: "2026-10-23" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Save milestone" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/events/{id}/milestones",
        expect.objectContaining({
          params: { path: { id: "e1" } },
          body: {
            name: "Soundcheck",
            dueDate: "2026-10-23",
            status: "NOT_STARTED",
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open and shows why a save failed", async () => {
    currentAccess.value = access("event.update");
    patch.mockResolvedValue({
      error: { code: "EVENT_MILESTONE_NOT_FOUND", status: 404 },
      response: { ok: false, status: 404 },
    });
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      await screen.findByRole("button", { name: "Edit Doors open" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save milestone" }),
    );
    expect(
      await within(dialog).findByText(
        "This milestone no longer exists. Refresh the page.",
      ),
    ).toBeVisible();
  });

  it("confirms before deleting a milestone", async () => {
    currentAccess.value = access("event.update");
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      await screen.findByRole("button", { name: "Edit Doors open" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/events/{id}/milestones/{milestoneId}",
        expect.objectContaining({
          params: { path: { id: "e1", milestoneId: "m1" } },
        }),
      ),
    );
  });
});
