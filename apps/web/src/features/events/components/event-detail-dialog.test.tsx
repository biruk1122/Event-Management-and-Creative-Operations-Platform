import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The dialog default-imports read helpers from the gateway, which pulls in the
// browser client and its validated env. Every read is injected in these tests,
// so a stub client keeps that import chain from throwing.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import { EventDetailDialog } from "./event-detail-dialog";
import type {
  DeleteEventOutcome,
  SetEventBudgetOutcome,
  TransitionEventOutcome,
  UpdateEventOutcome,
} from "../lib/events-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  Event,
  EventBudget,
} from "../lib/events-types";

const now = "2026-09-01T09:00:00.000Z";

const USERS: AssignableUser[] = [
  {
    id: "u1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "u2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
];
const TEAMS: AssignableTeam[] = [
  { id: "t1", name: "Stage Crew" },
  { id: "t2", name: "Content Studio" },
];

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    workspaceId: "ws-1",
    name: "Aurora Premiere",
    eventType: "FILM_PREMIERE",
    description: "Opening night.",
    status: "PLANNING",
    startAt: null,
    endAt: null,
    location: "Grand Hall",
    organizerName: "Arts Council",
    manager: null,
    teams: [{ id: "t1", name: "Stage Crew" }],
    participants: [
      {
        id: "u2",
        email: "dana@example.com",
        firstName: "Dana",
        lastName: "Okafor",
      },
    ],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<Parameters<typeof EventDetailDialog>[0]> = {},
) {
  const props = {
    eventId: "evt-1" as string | null,
    onOpenChange: vi.fn(),
    users: USERS,
    teams: TEAMS,
    canUpdate: true,
    canTransition: true,
    canAssignManager: true,
    canAssignTeams: true,
    canReadBudget: true,
    canUpdateBudget: true,
    canDelete: true,
    getEvent: vi.fn((): Promise<Event | null> => Promise.resolve(makeEvent())),
    getBudget: vi.fn((): Promise<EventBudget | null> =>
      Promise.resolve({ amount: null, currency: null }),
    ),
    onUpdate: vi.fn((): Promise<UpdateEventOutcome> =>
      Promise.resolve({
        status: "success",
        event: makeEvent({ name: "Renamed" }),
      }),
    ),
    onTransition: vi.fn((): Promise<TransitionEventOutcome> =>
      Promise.resolve({
        status: "success",
        event: makeEvent({ status: "READY" }),
      }),
    ),
    onAssignManager: vi.fn(() =>
      Promise.resolve({ status: "success" as const, event: makeEvent() }),
    ),
    onAssignTeam: vi.fn(() =>
      Promise.resolve({ status: "success" as const, event: makeEvent() }),
    ),
    onRemoveTeam: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        event: makeEvent({ teams: [] }),
      }),
    ),
    onSetBudget: vi.fn((): Promise<SetEventBudgetOutcome> =>
      Promise.resolve({
        status: "success",
        budget: { amount: "5000.00", currency: "USD" },
      }),
    ),
    onDelete: vi.fn((): Promise<DeleteEventOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EventDetailDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

async function waitForLoaded() {
  return within(await screen.findByRole("dialog")).findByRole("heading", {
    name: "Aurora Premiere",
  });
}

describe("EventDetailDialog", () => {
  it("loads the event and shows its details", async () => {
    renderDialog();
    await waitForLoaded();
    expect(screen.getByLabelText("Name")).toHaveValue("Aurora Premiere");
    expect(screen.getByText("Stage Crew")).toBeVisible();
    expect(screen.getByText("Dana Okafor")).toBeVisible();
  });

  it("shows an error state when the event cannot be loaded", async () => {
    renderDialog({ getEvent: vi.fn(() => Promise.resolve(null)) });
    expect(
      await screen.findByText("We could not load this event"),
    ).toBeVisible();
  });

  it("saves edited details", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith(
        "evt-1",
        expect.objectContaining({ name: "Renamed" }),
      ),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("moves the event through an allowed transition", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("combobox", { name: "Move to" }));
    await user.click(await screen.findByRole("option", { name: "Ready" }));

    await waitFor(() =>
      expect(props.onTransition).toHaveBeenCalledWith("evt-1", "READY"),
    );
  });

  it("hides the transition control for a terminal status", async () => {
    renderDialog({
      getEvent: vi.fn(() =>
        Promise.resolve(makeEvent({ status: "COMPLETED" })),
      ),
    });
    await waitForLoaded();
    expect(screen.getByText("Completed is a final state.")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Move to" }),
    ).not.toBeInTheDocument();
  });

  it("unassigns a team", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(
      screen.getByRole("button", { name: "Unassign Stage Crew" }),
    );
    await waitFor(() =>
      expect(props.onRemoveTeam).toHaveBeenCalledWith("evt-1", "t1"),
    );
  });

  it("validates the budget before calling the API and then saves it", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.type(screen.getByLabelText("Currency"), "us");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/3-letter code/)).toBeVisible();
    expect(props.onSetBudget).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Currency"));
    await user.type(screen.getByLabelText("Currency"), "USD");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(props.onSetBudget).toHaveBeenCalledWith("evt-1", 5000, "USD"),
    );
  });

  it("shows a restricted budget state when the budget is not readable", async () => {
    renderDialog({ getBudget: vi.fn(() => Promise.resolve(null)) });
    await waitForLoaded();
    expect(
      screen.getByText("You do not have permission to view the budget."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
  });

  it("confirms then deletes the event", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("evt-1"));
    expect(props.onDeleted).toHaveBeenCalledWith("evt-1");
  });

  it("surfaces an action error from a failed transition", async () => {
    const user = userEvent.setup();
    renderDialog({
      onTransition: vi.fn(() =>
        Promise.resolve({ status: "invalid_transition" as const }),
      ),
    });
    await waitForLoaded();

    await user.click(screen.getByRole("combobox", { name: "Move to" }));
    await user.click(await screen.findByRole("option", { name: "Ready" }));

    expect(
      await screen.findByText(
        "That move is not allowed from the current status.",
      ),
    ).toBeVisible();
  });

  it("is read-only for a caller with only the read grant", async () => {
    renderDialog({
      canUpdate: false,
      canTransition: false,
      canAssignManager: false,
      canAssignTeams: false,
      canReadBudget: false,
      canUpdateBudget: false,
      canDelete: false,
    });
    await waitForLoaded();

    expect(
      screen.queryByRole("button", { name: "Save details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access to this event/)).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Move to" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Current status: Planning.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Unassign Stage Crew" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to view the budget."),
    ).toBeVisible();
  });

  it("shows the budget read-only when the caller cannot update it", async () => {
    renderDialog({
      canUpdateBudget: false,
      getBudget: vi.fn(() =>
        Promise.resolve({ amount: "1200.00", currency: "GBP" }),
      ),
    });
    await waitForLoaded();

    expect(screen.getByText("Current: 1200.00 GBP")).toBeVisible();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
  });
});
