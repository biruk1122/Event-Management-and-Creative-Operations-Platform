import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import type { SaveWorkspaceOutcome } from "../lib/workspaces-outcome";
import type { AssignableUser, Workspace } from "../lib/workspaces-types";

const now = "2026-09-01T09:00:00.000Z";
const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

function created(): Workspace {
  return {
    id: "ws-new",
    kind: "PROJECT",
    manager: null,
    teams: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
  };
}

function setup(
  onCreate: (...args: unknown[]) => Promise<SaveWorkspaceOutcome> = () =>
    Promise.resolve({ status: "success", workspace: created() }),
) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateWorkspaceDialog
      open
      onOpenChange={onOpenChange}
      managers={MANAGERS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { onOpenChange, onCreated };
}

describe("CreateWorkspaceDialog", () => {
  it("submits the chosen kind and manager, then closes on success", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveWorkspaceOutcome> =>
      Promise.resolve({ status: "success", workspace: created() }),
    );
    const { onOpenChange, onCreated } = setup(onCreate);

    await user.click(screen.getByRole("combobox", { name: "Kind" }));
    await user.click(await screen.findByRole("option", { name: "Project" }));

    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        kind: "PROJECT",
        managerId: null,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(created());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and shows a message when the create fails", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onCreated } = setup(() =>
      Promise.resolve({ status: "unexpected" }),
    );

    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      await screen.findByText("We could not create the workspace. Try again."),
    ).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    let resolve: ((outcome: SaveWorkspaceOutcome) => void) | undefined;
    setup(
      () =>
        new Promise<SaveWorkspaceOutcome>((r) => {
          resolve = r;
        }),
    );

    const submit = screen.getByRole("button", { name: "Create workspace" });
    await user.click(submit);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();

    resolve?.({ status: "unexpected" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create workspace" }),
      ).toBeEnabled(),
    );
  });
});
