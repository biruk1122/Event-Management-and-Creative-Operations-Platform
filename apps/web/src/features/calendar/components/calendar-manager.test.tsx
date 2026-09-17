import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CalendarManager } from "./calendar-manager";
import type { CalendarEntry } from "../lib/calendar-types";

const ANCHOR = new Date(2026, 8, 16); // a Wednesday

function entries(): CalendarEntry[] {
  return [
    {
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
    },
    {
      id: "personal-1",
      title: "Dentist appointment",
      description: null,
      type: "PERSONAL",
      startAt: new Date(2026, 8, 16, 15, 30).toISOString(),
      endAt: null,
      eventId: null,
      taskId: null,
      projectId: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
}

function setup() {
  const user = userEvent.setup();
  render(<CalendarManager initialEntries={entries()} initialAnchor={ANCHOR} />);
  return user;
}

describe("CalendarManager", () => {
  it("shows month view by default with both fixture entries", () => {
    setup();
    expect(screen.getByText("Q4 launch event")).toBeVisible();
    expect(screen.getByText("Dentist appointment")).toBeVisible();
  });

  it("switches to week, day, and agenda views and keeps showing the data", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();
    expect(screen.getByText("Dentist appointment")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Agenda" }));
    expect(screen.getByText("Q4 launch event")).toBeVisible();
  });

  it("hides a type's entries when its filter is unchecked", async () => {
    const user = setup();

    await user.click(screen.getByRole("checkbox", { name: "Event entries" }));

    expect(screen.queryByText("Q4 launch event")).not.toBeInTheDocument();
    expect(screen.getByText("Dentist appointment")).toBeVisible();
  });

  it("opens the read-only detail view for a projected entry, not an edit form", async () => {
    const user = setup();

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

  it("edits a mutable entry and reflects the change immediately", async () => {
    const user = setup();

    await user.click(screen.getByText("Dentist appointment"));
    const dialog = screen.getByRole("dialog");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Dentist follow-up");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("Dentist follow-up")).toBeVisible();
    expect(screen.queryByText("Dentist appointment")).not.toBeInTheDocument();
  });

  it("deletes a mutable entry", async () => {
    const user = setup();

    await user.click(screen.getByText("Dentist appointment"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("Dentist appointment")).not.toBeInTheDocument();
  });

  it("creates a new entry through the toolbar's Add entry action", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Add entry" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Vet visit");
    fireEvent.change(within(dialog).getByLabelText("Start"), {
      target: { value: "2026-09-16T11:00" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create entry" }),
    );

    expect(await screen.findByText("Vet visit")).toBeVisible();
  });

  it("navigating to the next month changes the range label and hides this month's entries", async () => {
    const user = setup();
    const initialLabel = screen.getByText("September 2026");
    expect(initialLabel).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByText("October 2026")).toBeVisible();
    expect(screen.queryByText("Q4 launch event")).not.toBeInTheDocument();
  });
});
