import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateProjectDialog } from "./create-project-dialog";
import type { SaveProjectOutcome } from "../lib/projects-outcome";
import type {
  AssignableEvent,
  AssignableUser,
  Project,
} from "../lib/projects-types";

const now = "2026-09-01T09:00:00.000Z";
const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];
const EVENTS: AssignableEvent[] = [
  { id: "evt-1", name: "Orbit Product Launch" },
];

function created(): Project {
  return {
    id: "prj-new",
    workspaceId: "ws-new",
    name: "New Project",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function setup(
  onCreate: (...args: unknown[]) => Promise<SaveProjectOutcome> = () =>
    Promise.resolve({ status: "success", project: created() }),
) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateProjectDialog
      open
      onOpenChange={onOpenChange}
      managers={MANAGERS}
      events={EVENTS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { onOpenChange, onCreated };
}

describe("CreateProjectDialog", () => {
  it("submits the entered values and closes on success", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveProjectOutcome> =>
      Promise.resolve({ status: "success", project: created() }),
    );
    const { onOpenChange, onCreated } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Launch Microsite");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Launch Microsite",
          eventId: null,
          managerId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(created());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits a chosen related event", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveProjectOutcome> =>
      Promise.resolve({ status: "success", project: created() }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Launch Microsite");
    await user.click(
      screen.getByRole("combobox", { name: "Related event (optional)" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Orbit Product Launch" }),
    );
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: "evt-1" }),
      ),
    );
  });

  it("blocks submit and shows a field error when the name is blank", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveProjectOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("Enter a name.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("flags an end before the start without calling the API", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveProjectOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Bad Range");
    await user.type(screen.getByLabelText("Starts (UTC)"), "2026-10-02T10:00");
    await user.type(screen.getByLabelText("Ends (UTC)"), "2026-10-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create project" }));

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
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByText("We could not create the project. Try again."),
    ).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
