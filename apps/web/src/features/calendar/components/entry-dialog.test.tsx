import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EntryDialog, type EntryFormOutcome } from "./entry-dialog";
import type { CalendarEntry } from "../lib/calendar-types";

function personalEntry(): CalendarEntry {
  return {
    id: "entry-1",
    title: "Dentist appointment",
    description: "Annual checkup",
    type: "PERSONAL",
    startAt: "2026-09-16T15:30:00.000Z",
    endAt: "2026-09-16T16:30:00.000Z",
    eventId: null,
    taskId: null,
    projectId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("EntryDialog", () => {
  it("requires a title before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EntryDialog
        open
        onOpenChange={() => {}}
        initialStart={new Date(2026, 8, 16, 9)}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create entry" }));

    expect(await screen.findByText("Title is required.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an end time before the start", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EntryDialog
        open
        onOpenChange={() => {}}
        initialStart={new Date(2026, 8, 16, 9)}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Team sync");
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-09-16T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End (optional)"), {
      target: { value: "2026-09-16T09:00" },
    });
    await user.click(screen.getByRole("button", { name: "Create entry" }));

    expect(
      await screen.findByText("End must be at or after the start."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid values and closes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const outcome: EntryFormOutcome = {
      status: "success",
      entry: personalEntry(),
    };
    const onSubmit = vi.fn().mockResolvedValue(outcome);
    render(
      <EntryDialog
        open
        onOpenChange={onOpenChange}
        initialStart={new Date(2026, 8, 16, 9)}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Team sync");
    await user.click(screen.getByRole("button", { name: "Create entry" }));

    expect(
      await screen.findByRole("button", { name: "Create entry" }),
    ).not.toBeDisabled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Team sync", type: "PERSONAL" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pre-fills the form and offers delete when editing an existing entry", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <EntryDialog
        open
        onOpenChange={() => {}}
        entry={personalEntry()}
        onSubmit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Dentist appointment");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("entry-1");
  });

  it("shows a generic error when the save outcome is unexpected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ status: "unexpected" } satisfies EntryFormOutcome);
    render(
      <EntryDialog
        open
        onOpenChange={() => {}}
        initialStart={new Date(2026, 8, 16, 9)}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Team sync");
    await user.click(screen.getByRole("button", { name: "Create entry" }));

    expect(
      await screen.findByText("We could not save this entry. Try again."),
    ).toBeVisible();
  });
});
