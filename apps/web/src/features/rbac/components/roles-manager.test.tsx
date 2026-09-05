import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RolesManager } from "./roles-manager";
import type {
  AddGrantOutcome,
  DeleteRoleOutcome,
  RemoveGrantOutcome,
  SaveRoleOutcome,
} from "../lib/rbac-outcome";
import type { Permission, Role, RoleWithGrants } from "../lib/rbac-types";

const now = "2026-09-01T09:00:00.000Z";

const PERMISSIONS: Permission[] = [
  { key: "role.read", description: "View roles and their grants." },
];

const CUSTOM_ROLE: Role = {
  id: "role-9",
  name: "Regional Coordinator",
  description: "Coordinates activity across one region.",
  isSystem: false,
  createdAt: now,
  updatedAt: now,
};

const CUSTOM_ROLE_WITH_GRANTS: RoleWithGrants = { ...CUSTOM_ROLE, grants: [] };

function noopSeams() {
  return {
    createRole: vi.fn((): Promise<SaveRoleOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    ),
    updateRole: vi.fn((): Promise<SaveRoleOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    ),
    deleteRole: vi.fn((): Promise<DeleteRoleOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    ),
    getRole: vi.fn(() => Promise.resolve(CUSTOM_ROLE_WITH_GRANTS)),
    addGrant: vi.fn((): Promise<AddGrantOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    ),
    removeGrant: vi.fn((): Promise<RemoveGrantOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    ),
  };
}

describe("RolesManager", () => {
  it("shows the empty state and a count of zero when there are no roles", () => {
    render(
      <RolesManager
        initialRoles={[]}
        permissions={PERMISSIONS}
        {...noopSeams()}
      />,
    );

    expect(screen.getByText("0 roles")).toBeVisible();
    expect(screen.getByText("No roles yet")).toBeVisible();
  });

  it("pluralizes the role count correctly", () => {
    render(
      <RolesManager
        initialRoles={[CUSTOM_ROLE]}
        permissions={PERMISSIONS}
        {...noopSeams()}
      />,
    );

    expect(screen.getByText("1 role")).toBeVisible();
  });

  it("opens the create dialog and adds a new role to the list on success", async () => {
    const user = userEvent.setup();
    const seams = noopSeams();
    const created: Role = {
      id: "role-10",
      name: "New Role",
      description: "",
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };
    seams.createRole = vi.fn((): Promise<SaveRoleOutcome> =>
      Promise.resolve({ status: "success", role: created }),
    );

    render(
      <RolesManager initialRoles={[]} permissions={PERMISSIONS} {...seams} />,
    );

    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.type(screen.getByLabelText("Name"), "New Role");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText("1 role")).toBeVisible();
    const nameButtons = screen.getAllByRole("button", { name: "New Role" });
    expect(nameButtons.length).toBeGreaterThan(0);
  });

  it("opens the detail dialog for the selected role", async () => {
    const user = userEvent.setup();
    const seams = noopSeams();

    render(
      <RolesManager
        initialRoles={[CUSTOM_ROLE]}
        permissions={PERMISSIONS}
        {...seams}
      />,
    );

    const [nameButton] = screen.getAllByRole("button", {
      name: "Regional Coordinator",
    });
    await user.click(nameButton!);

    expect(seams.getRole).toHaveBeenCalledWith("role-9");
    expect(
      await screen.findByRole("heading", { name: "Regional Coordinator" }),
    ).toBeVisible();
  });

  it("removes a role from the list once it is deleted", async () => {
    const user = userEvent.setup();
    const seams = noopSeams();
    seams.deleteRole = vi.fn((): Promise<DeleteRoleOutcome> =>
      Promise.resolve({ status: "success" }),
    );

    render(
      <RolesManager
        initialRoles={[CUSTOM_ROLE]}
        permissions={PERMISSIONS}
        {...seams}
      />,
    );

    const [nameButton] = screen.getAllByRole("button", {
      name: "Regional Coordinator",
    });
    await user.click(nameButton!);
    await screen.findByRole("heading", { name: "Regional Coordinator" });

    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(screen.getByText("0 roles")).toBeVisible());
  });
});
