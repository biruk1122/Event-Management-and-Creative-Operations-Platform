import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthView } from "./month-view";
import { isSameDay } from "../lib/calendar-date";
import type { CalendarEntry } from "../lib/calendar-types";

const ANCHOR = new Date(2026, 8, 16);

function entryAt(id: string, hour: number): CalendarEntry {
  return {
    id,
    title: `Entry ${id}`,
    description: null,
    type: "PERSONAL",
    startAt: new Date(2026, 8, 16, hour).toISOString(),
    endAt: null,
    eventId: null,
    taskId: null,
    projectId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("MonthView", () => {
  it("shows an overflow indicator beyond the first three entries on a day", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    const four = [
      entryAt("a", 8),
      entryAt("b", 9),
      entryAt("c", 10),
      entryAt("d", 11),
    ];
    render(
      <MonthView
        anchor={ANCHOR}
        entries={four}
        onOpenDay={onOpenDay}
        onCreateAt={vi.fn()}
        onSelectEntry={vi.fn()}
      />,
    );

    expect(screen.getByText("Entry a")).toBeVisible();
    expect(screen.getByText("Entry c")).toBeVisible();
    expect(screen.queryByText("Entry d")).not.toBeInTheDocument();

    const overflow = screen.getByText("+1 more");
    await user.click(overflow);
    expect(onOpenDay).toHaveBeenCalledTimes(1);
    expect(isSameDay(onOpenDay.mock.calls[0]![0] as Date, ANCHOR)).toBe(true);
  });

  it("opens the create dialog for the clicked day's add button, not the whole day", async () => {
    const user = userEvent.setup();
    const onCreateAt = vi.fn();
    const onOpenDay = vi.fn();
    render(
      <MonthView
        anchor={ANCHOR}
        entries={[]}
        onOpenDay={onOpenDay}
        onCreateAt={onCreateAt}
        onSelectEntry={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: `Add an entry on ${ANCHOR.toLocaleDateString()}`,
      }),
    );

    expect(onCreateAt).toHaveBeenCalledTimes(1);
    expect(onOpenDay).not.toHaveBeenCalled();
  });
});
