import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RoleDetailDialog } from "./role-detail-dialog";
import type {
  AddGrantOutcome,
  DeleteRoleOutcome,
  RemoveGrantOutcome,
  SaveRoleOutcome,
} from "../lib/rbac-outcome";
import type { Permission, RoleWithGrants } from "../lib/rbac-types";

const now = "2026-09-01T09:00:00.000Z";

const PERMISSIONS: Permission[] = [
  { key: "role.read", description: "View roles and their grants." },
  { key: "role.delete", description: "Remove a role that is not in use." },
];

const CUSTOM_ROLE: RoleWithGrants = {
  id: "role-9",
  name: "Regional Coordinator",
  description: "Coordinates activity across one region.",
  isSystem: false,
  createdAt: now,
  updatedAt: now,
  grants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
};

const SYSTEM_ROLE: RoleWithGrants = {
  ...CUSTOM_ROLE,
  id: "role-1",
  name: "Super Admin",
  isSystem: true,
};

function baseProps(role: RoleWithGrants) {
  return {
    roleId: role.id,
    onOpenChange: vi.fn(),
    permissions: PERMISSIONS,
    getRole: vi.fn(() => Promise.resolve(role)),
    onUpdate: vi.fn((): Promise<SaveRoleOutcome> =>
      Promise.resolve({ status: "success", role }),
    ),
    onDelete: vi.fn((): Promise<DeleteRoleOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onAddGrant: vi.fn((): Promise<AddGrantOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onRemoveGrant: vi.fn((): Promise<RemoveGrantOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
  };
}

describe("RoleDetailDialog", () => {
  it("shows a loading state before the role resolves", () => {
    let resolveRole: (() => void) | undefined;
    const props = baseProps(CUSTOM_ROLE);
    props.getRole = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRole = () => resolve(CUSTOM_ROLE);
        }),
    );

    render(<RoleDetailDialog {...props} />);

    expect(screen.getByText("Loading role…")).toBeVisible();
    resolveRole?.();
  });

  it("loads and displays the role's fields", async () => {
    const props = baseProps(CUSTOM_ROLE);
    render(<RoleDetailDialog {...props} />);

    expect(
      await screen.findByDisplayValue("Regional Coordinator"),
    ).toBeVisible();
    expect(
      screen.getByDisplayValue("Coordinates activity across one region."),
    ).toBeVisible();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("marks a system role and hides its delete action", async () => {
    const props = baseProps(SYSTEM_ROLE);
    render(<RoleDetailDialog {...props} />);

    await screen.findByDisplayValue("Super Admin");
    expect(screen.getByText("System")).toBeVisible();
    expect(screen.getByText("System roles cannot be deleted.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete role" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Save disabled until a field changes, then submits the new values", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    render(<RoleDetailDialog {...props} />);

    const name = await screen.findByDisplayValue("Regional Coordinator");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, "Region Lead");
    expect(save).not.toBeDisabled();

    await user.click(save);

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith("role-9", {
        name: "Region Lead",
        description: "Coordinates activity across one region.",
      }),
    );
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("shows a name-conflict error on save without closing", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    props.onUpdate = vi.fn((): Promise<SaveRoleOutcome> =>
      Promise.resolve({ status: "name_conflict" }),
    );
    render(<RoleDetailDialog {...props} />);

    const name = await screen.findByDisplayValue("Regional Coordinator");
    await user.type(name, " II");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Another role already uses that name."),
    ).toBeVisible();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("confirms before deleting a custom role, and reports success", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    render(<RoleDetailDialog {...props} />);

    await screen.findByDisplayValue("Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Delete role" }));

    expect(props.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("role-9"));
    expect(props.onDeleted).toHaveBeenCalledWith("role-9");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels the delete confirmation without calling onDelete", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    render(<RoleDetailDialog {...props} />);

    await screen.findByDisplayValue("Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete role" })).toBeVisible();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("moves focus onto the confirm button, and back onto Delete on cancel", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    render(<RoleDetailDialog {...props} />);

    await screen.findByDisplayValue("Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Delete role" }));

    expect(
      await screen.findByRole("button", { name: "Confirm delete" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("button", { name: "Delete role" }),
    ).toHaveFocus();
  });

  it("shows an in-use error and keeps the dialog open on a blocked delete", async () => {
    const user = userEvent.setup();
    const props = baseProps(CUSTOM_ROLE);
    props.onDelete = vi.fn((): Promise<DeleteRoleOutcome> =>
      Promise.resolve({ status: "in_use" }),
    );
    render(<RoleDetailDialog {...props} />);

    await screen.findByDisplayValue("Regional Coordinator");
    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(
      await screen.findByText(
        "This role is assigned to at least one user and cannot be deleted.",
      ),
    ).toBeVisible();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("renders the role's grants inside the permission editor", async () => {
    render(<RoleDetailDialog {...baseProps(CUSTOM_ROLE)} />);

    await screen.findByDisplayValue("Regional Coordinator");
    expect(
      screen.getByRole("button", {
        name: "Revoke role.read at Organization scope",
      }),
    ).toBeInTheDocument();
  });
});
