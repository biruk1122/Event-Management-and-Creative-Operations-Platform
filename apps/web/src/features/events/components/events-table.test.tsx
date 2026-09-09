import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventsTable } from "./events-table";
import type { Event } from "../lib/events-types";

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

describe("EventsTable", () => {
  it("shows an empty state that reflects whether filters are active", () => {
    const { rerender } = render(
      <EventsTable
        events={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );
    expect(screen.getByText("No events yet")).toBeVisible();

    rerender(
      <EventsTable
        events={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered
      />,
    );
    expect(screen.getByText("No events match these filters")).toBeVisible();
  });

  it("renders a row per event and selects one on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EventsTable
        events={[
          makeEvent({
            id: "e1",
            name: "Aurora Premiere",
            status: "READY",
            startAt: "2026-10-04T18:00:00.000Z",
          }),
          makeEvent({ id: "e2", name: "Midnight Concert" }),
        ]}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    await user.click(
      screen.getAllByRole("button", { name: "Aurora Premiere" })[0]!,
    );
    expect(onSelect).toHaveBeenCalledWith("e1");
  });

  it("shows pagination only when there is more than one page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <EventsTable
        events={[makeEvent({ id: "e1", name: "One" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Events pagination" }),
    ).not.toBeInTheDocument();

    rerender(
      <EventsTable
        events={[makeEvent({ id: "e1", name: "One" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
