import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateRoleDialog } from "./create-role-dialog";
import type { CreateRole, SaveRoleOutcome } from "../lib/rbac-outcome";

const now = "2026-09-01T09:00:00.000Z";

function setup(onCreate: CreateRole, onCreated = vi.fn()) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(
    <CreateRoleDialog
      open
      onOpenChange={onOpenChange}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { user, onOpenChange, onCreated };
}

const resolvesTo = (outcome: SaveRoleOutcome): CreateRole =>
  vi.fn(() => Promise.resolve(outcome));

describe("CreateRoleDialog", () => {
  it("submits the typed name and description", async () => {
    const onCreate = resolvesTo({
      status: "success",
      role: {
        id: "role-9",
        name: "Regional Coordinator",
        description: "Coordinates activity across one region.",
        isSystem: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Regional Coordinator");
    await user.type(
      screen.getByLabelText("Description"),
      "Coordinates activity across one region.",
    );
    await user.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Regional Coordinator",
        description: "Coordinates activity across one region.",
      }),
    );
  });

  it("closes and reports the created role on success", async () => {
    const role = {
      id: "role-9",
      name: "Regional Coordinator",
      description: "",
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };
    const onCreate = resolvesTo({ status: "success", role });
    const { user, onOpenChange, onCreated } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(role));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a name conflict error and preserves the typed values", async () => {
    const onCreate = resolvesTo({ status: "name_conflict" });
    const { user } = setup(onCreate);

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "Team Member");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A role with that name already exists.");
    expect(nameInput).toHaveValue("Team Member");
  });

  it("maps a field error returned by the handler onto the name input", async () => {
    const onCreate = resolvesTo({
      status: "field_errors",
      fieldErrors: { name: "That name is reserved." },
    });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Super Admin");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText("That name is reserved.")).toBeVisible();
  });

  it("surfaces a permission-denied outcome", async () => {
    const onCreate = resolvesTo({ status: "permission_denied" });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(
      await screen.findByText("You do not have permission to create a role."),
    ).toBeVisible();
  });

  it("disables the submit button while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const onCreate: CreateRole = vi.fn(
      () =>
        new Promise<SaveRoleOutcome>((resolve) => {
          release = () =>
            resolve({
              status: "success",
              role: {
                id: "role-9",
                name: "x",
                description: "",
                isSystem: false,
                createdAt: now,
                updatedAt: now,
              },
            });
        }),
    );
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    const pending = await screen.findByRole("button", { name: /creating/i });
    expect(pending).toBeDisabled();

    release?.();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onCreate = resolvesTo({ status: "unexpected" });
    const { user, onOpenChange } = setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
