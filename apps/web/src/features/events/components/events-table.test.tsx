import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventsTable, type EventSort } from "./events-table";
import type { Event } from "../lib/events-types";

const now = "2026-09-01T09:00:00.000Z";
const SORT: EventSort = { field: "createdAt", direction: "asc" };

function makeEvent(
  overrides: Partial<Event> & Pick<Event, "id" | "name">,
): Event {
  return {
    workspaceId: `ws-${overrides.id}`,
    eventType: "CONCERT",
    description: null,
    status: "PLANNING",
    startAt: null,
    reminderAt: null,
    endAt: null,
    location: null,
    organizerName: null,
    departmentId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    progress: { completed: 0, total: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function tableProps(
  overrides: Partial<React.ComponentProps<typeof EventsTable>> = {},
) {
  return {
    events: [],
    onSelect: vi.fn(),
    page: 1,
    pageCount: 1,
    onPageChange: vi.fn(),
    filtered: false,
    sort: SORT,
    onSortChange: vi.fn(),
    ...overrides,
  };
}

describe("EventsTable", () => {
  it("shows an empty state that reflects whether filters are active", () => {
    const { rerender } = render(<EventsTable {...tableProps()} />);
    expect(screen.getByText("No events yet")).toBeVisible();

    rerender(<EventsTable {...tableProps({ filtered: true })} />);
    expect(screen.getByText("No events match these filters")).toBeVisible();
  });

  it("renders a row per event and selects one on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EventsTable
        {...tableProps({
          onSelect,
          events: [
            makeEvent({
              id: "e1",
              name: "Aurora Premiere",
              status: "READY",
              startAt: "2026-10-04T18:00:00.000Z",
            }),
            makeEvent({ id: "e2", name: "Midnight Concert" }),
          ],
        })}
      />,
    );

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    await user.click(
      screen.getAllByRole("button", { name: "Aurora Premiere" })[0]!,
    );
    expect(onSelect).toHaveBeenCalledWith("e1");
  });

  it("shows the linked-task progress as a percentage, or a note when no tasks are linked", () => {
    render(
      <EventsTable
        {...tableProps({
          events: [
            makeEvent({
              id: "e1",
              name: "Tracked",
              progress: { completed: 3, total: 4 },
            }),
            makeEvent({ id: "e2", name: "Untracked" }),
          ],
        })}
      />,
    );

    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No linked tasks").length).toBeGreaterThan(0);
  });

  it("toggles the sort direction when the active column header is chosen", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <EventsTable
        {...tableProps({
          events: [makeEvent({ id: "e1", name: "One" })],
          sort: { field: "name", direction: "asc" },
          onSortChange,
        })}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Event/ });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(nameHeader).getByRole("button", { name: "Event" }));
    expect(onSortChange).toHaveBeenCalledWith({
      field: "name",
      direction: "desc",
    });

    await user.click(screen.getByRole("button", { name: "Date" }));
    expect(onSortChange).toHaveBeenLastCalledWith({
      field: "startAt",
      direction: "asc",
    });
  });

  it("shows pagination only when there is more than one page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const events = [makeEvent({ id: "e1", name: "One" })];
    const { rerender } = render(
      <EventsTable {...tableProps({ events, onPageChange })} />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Events pagination" }),
    ).not.toBeInTheDocument();

    rerender(
      <EventsTable {...tableProps({ events, onPageChange, pageCount: 3 })} />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
