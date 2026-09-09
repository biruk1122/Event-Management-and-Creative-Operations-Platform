import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventsManager } from "./events-manager";
import type {
  DeleteEventOutcome,
  SaveEventOutcome,
} from "../lib/events-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  Event,
  PaginatedEvents,
} from "../lib/events-types";

const now = "2026-09-01T09:00:00.000Z";

const USERS: AssignableUser[] = [
  {
    id: "u1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];
const TEAMS: AssignableTeam[] = [{ id: "t1", name: "Stage Crew" }];

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

const EVENTS: Event[] = [
  makeEvent({ id: "e1", name: "Aurora Premiere", status: "READY" }),
  makeEvent({
    id: "e2",
    name: "Midnight Concert",
    eventType: "CONCERT",
    status: "IN_PROGRESS",
  }),
  makeEvent({
    id: "e3",
    name: "Orbit Launch",
    eventType: "PRODUCT_LAUNCH",
    status: "PLANNING",
  }),
];

function page(items: Event[]): PaginatedEvents {
  return { items, page: 1, pageSize: 25, total: items.length };
}

function renderManager(
  overrides: Partial<Parameters<typeof EventsManager>[0]> = {},
) {
  return render(
    <EventsManager
      initialPage={page(EVENTS)}
      assignableUsers={USERS}
      assignableTeams={TEAMS}
      {...overrides}
    />,
  );
}

describe("EventsManager", () => {
  it("shows the count and lists the initial page", () => {
    renderManager();
    expect(screen.getByText("3 events")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Aurora Premiere" }).length,
    ).toBeGreaterThan(0);
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "In progress" }),
    );

    expect(screen.getByText("1 event match these filters")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Aurora Premiere" }),
    ).not.toBeInTheDocument();
  });

  it("filters by a name search term", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Search"), "orbit");
    expect(screen.getByText("1 event match these filters")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Orbit Launch" }).length,
    ).toBeGreaterThan(0);
  });

  it("adds an event to the list on a successful create", async () => {
    const user = userEvent.setup();
    const createEvent = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({
        status: "success",
        event: makeEvent({ id: "e4", name: "Harvest Gala" }),
      }),
    );
    renderManager({ createEvent });

    await user.click(screen.getByRole("button", { name: "New event" }));
    await user.type(
      within(await screen.findByRole("dialog")).getByLabelText("Name"),
      "Harvest Gala",
    );
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(screen.getByText("4 events")).toBeVisible());
  });

  it("opens the detail dialog for a row and removes it after a delete", async () => {
    const user = userEvent.setup();
    const deleteEvent = vi.fn((): Promise<DeleteEventOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    const getEvent = vi.fn((id: string) =>
      Promise.resolve(EVENTS.find((e) => e.id === id) ?? null),
    );
    const getBudget = vi.fn(() =>
      Promise.resolve({ amount: null, currency: null }),
    );
    renderManager({ deleteEvent, getEvent, getBudget });

    await user.click(
      screen.getAllByRole("button", { name: "Orbit Launch" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Orbit Launch" });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete event" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() => expect(screen.getByText("2 events")).toBeVisible());
    expect(deleteEvent).toHaveBeenCalledWith("e3");
  });
});
