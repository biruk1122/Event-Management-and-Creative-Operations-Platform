import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateEventDialog } from "./create-event-dialog";
import type { SaveEventOutcome } from "../lib/events-outcome";
import type { AssignableUser, Event } from "../lib/events-types";

const now = "2026-09-01T09:00:00.000Z";
const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

function created(): Event {
  return {
    id: "evt-new",
    workspaceId: "ws-new",
    name: "New Event",
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
  };
}

function setup(
  onCreate: (...args: unknown[]) => Promise<SaveEventOutcome> = () =>
    Promise.resolve({ status: "success", event: created() }),
) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateEventDialog
      open
      onOpenChange={onOpenChange}
      managers={MANAGERS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { onOpenChange, onCreated };
}

describe("CreateEventDialog", () => {
  it("submits the entered values and closes on success", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "success", event: created() }),
    );
    const { onOpenChange, onCreated } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Launch Night");
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(
      await screen.findByRole("option", { name: "Product launch" }),
    );
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Launch Night",
          eventType: "PRODUCT_LAUNCH",
          managerId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(created());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks submit and shows a field error when the name is blank", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Enter a name.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("flags an end before the start without calling the API", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Bad Range");
    await user.type(screen.getByLabelText("Starts (UTC)"), "2026-10-02T10:00");
    await user.type(screen.getByLabelText("Ends (UTC)"), "2026-10-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("The end must be on or after the start."),
    ).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows a message when the create fails", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onCreated } = setup(() =>
      Promise.resolve({ status: "unexpected" }),
    );

    await user.type(screen.getByLabelText("Name"), "Try Again");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("We could not create the event. Try again."),
    ).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
