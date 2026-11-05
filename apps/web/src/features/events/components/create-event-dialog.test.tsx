import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateEventDialog } from "./create-event-dialog";
import type { SaveEventOutcome } from "../lib/events-outcome";
import type {
  AssignableTeam,
  AssignableUser,
  Event,
} from "../lib/events-types";

const now = "2026-09-01T09:00:00.000Z";
const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];
const TEAMS: AssignableTeam[] = [{ id: "t1", name: "Production" }];

function created(): Event {
  return {
    id: "evt-new",
    workspaceId: "ws-new",
    name: "New Event",
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
  };
}

function setup(
  onCreate: (...args: unknown[]) => Promise<SaveEventOutcome> = () =>
    Promise.resolve({ status: "success", event: created() }),
  permissions: { canAssignTeams?: boolean; canUpdateBudget?: boolean } = {},
) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateEventDialog
      open
      onOpenChange={onOpenChange}
      managers={MANAGERS}
      teams={TEAMS}
      canAssignTeams={permissions.canAssignTeams ?? false}
      canUpdateBudget={permissions.canUpdateBudget ?? false}
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

    await user.type(screen.getByLabelText("Event name *"), "Launch Night");
    await user.click(screen.getByRole("combobox", { name: "Event type" }));
    await user.click(
      await screen.findByRole("option", { name: "Product launch" }),
    );
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("End date *"), {
      target: { value: "2026-10-02" },
    });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Launch Night",
          eventType: "PRODUCT_LAUNCH",
          managerId: null,
          status: "PLANNING",
          startAt: "2026-10-02T00:00",
          endAt: "2026-10-02T00:00",
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

  it("asks for a start and an end date before calling the API", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Event name *"), "Undated");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Choose a start date.")).toBeVisible();
    expect(screen.getByText("Choose an end date.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("flags an end before the start without calling the API", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Event name *"), "Bad Range");
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("End date *"), {
      target: { value: "2026-10-01" },
    });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("The end must be on or after the start."),
    ).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("sends selected teams and the ETB budget only when the caller may set them", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "success", event: created() }),
    );
    setup(onCreate, { canAssignTeams: true, canUpdateBudget: true });

    await user.type(screen.getByLabelText("Event name *"), "Funded");
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("End date *"), {
      target: { value: "2026-10-02" },
    });
    await user.click(screen.getByRole("button", { name: "Production" }));
    await user.type(screen.getByLabelText("Budget (optional, ETB)"), "2500000");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ teamIds: ["t1"], budgetAmount: "2500000" }),
      ),
    );
  });

  it("does not send teams or a budget without the matching permission", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveEventOutcome> =>
      Promise.resolve({ status: "success", event: created() }),
    );
    setup(onCreate);

    expect(
      screen.queryByLabelText("Budget (optional, ETB)"),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Event name *"), "Plain");
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("End date *"), {
      target: { value: "2026-10-02" },
    });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ teamIds: [], budgetAmount: "" }),
      ),
    );
  });

  it("keeps the dialog open and shows a message when the create fails", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onCreated } = setup(() =>
      Promise.resolve({ status: "unexpected" }),
    );

    await user.type(screen.getByLabelText("Event name *"), "Try Again");
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("End date *"), {
      target: { value: "2026-10-02" },
    });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("We could not create the event. Try again."),
    ).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
