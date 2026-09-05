import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PermissionGrantsEditor } from "./permission-grants-editor";
import type { AddGrantOutcome, RemoveGrantOutcome } from "../lib/rbac-outcome";
import type { Permission, RoleGrant } from "../lib/rbac-types";

const PERMISSIONS: Permission[] = [
  { key: "role.read", description: "View roles and their grants." },
  { key: "role.create", description: "Create a configurable role." },
  { key: "task.read", description: "View a task." },
];

const GRANTS: RoleGrant[] = [
  { permissionKey: "role.read", scope: "ORGANIZATION" },
];

function scopeButton(
  permissionKey: string,
  scopeLabel: string,
  granted: boolean,
) {
  const verb = granted ? "Revoke" : "Grant";
  return screen.getByRole("button", {
    name: `${verb} ${permissionKey} at ${scopeLabel} scope`,
  });
}

describe("PermissionGrantsEditor", () => {
  it("shows the currently granted scope as pressed", () => {
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={GRANTS}
        onAddGrant={vi.fn()}
        onRemoveGrant={vi.fn()}
      />,
    );

    const granted = scopeButton("role.read", "Organization", true);
    expect(granted).toHaveAttribute("aria-pressed", "true");

    const ungranted = scopeButton("role.read", "Department", false);
    expect(ungranted).toHaveAttribute("aria-pressed", "false");
  });

  it("groups permissions by resource", () => {
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={vi.fn()}
        onRemoveGrant={vi.fn()}
      />,
    );

    expect(screen.getByText("Role")).toBeVisible();
    expect(screen.getByText("Task")).toBeVisible();
  });

  it("filters permissions by the search input", async () => {
    const user = userEvent.setup();
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={vi.fn()}
        onRemoveGrant={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText("Search permissions"),
      "configurable",
    );

    expect(screen.getByText("role.create")).toBeVisible();
    expect(screen.queryByText("task.read")).not.toBeInTheDocument();
  });

  it("shows a no-results state for a query that matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={vi.fn()}
        onRemoveGrant={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Search permissions"), "nonexistent");

    expect(screen.getByText(/No permissions match/)).toBeVisible();
  });

  it("adds a grant when an ungranted scope is activated", async () => {
    const user = userEvent.setup();
    const onAddGrant = vi.fn((): Promise<AddGrantOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={onAddGrant}
        onRemoveGrant={vi.fn()}
      />,
    );

    await user.click(scopeButton("role.read", "Organization", false));

    expect(onAddGrant).toHaveBeenCalledWith("role.read", "ORGANIZATION");
    expect(
      await screen.findByText("Granted role.read at Organization scope."),
    ).toBeInTheDocument();
  });

  it("removes a grant when a granted scope is activated", async () => {
    const user = userEvent.setup();
    const onRemoveGrant = vi.fn((): Promise<RemoveGrantOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={GRANTS}
        onAddGrant={vi.fn()}
        onRemoveGrant={onRemoveGrant}
      />,
    );

    await user.click(scopeButton("role.read", "Organization", true));

    expect(onRemoveGrant).toHaveBeenCalledWith("role.read", "ORGANIZATION");
  });

  it("shows an error and does not crash when a toggle is denied", async () => {
    const user = userEvent.setup();
    const onAddGrant = vi.fn((): Promise<AddGrantOutcome> =>
      Promise.resolve({ status: "permission_denied" }),
    );
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={onAddGrant}
        onRemoveGrant={vi.fn()}
      />,
    );

    await user.click(scopeButton("role.read", "Organization", false));

    expect(
      await screen.findByText(
        "You do not have permission to change grants on this role.",
      ),
    ).toBeVisible();
  });

  it("disables every toggle and explains why in read-only mode", () => {
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={GRANTS}
        onAddGrant={vi.fn()}
        onRemoveGrant={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByText("Read-only")).toBeVisible();
    expect(scopeButton("role.read", "Organization", true)).toBeDisabled();
    expect(scopeButton("role.create", "Organization", false)).toBeDisabled();
  });

  it("disables only the toggle in flight while a request is pending", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const onAddGrant = vi.fn(
      () =>
        new Promise<AddGrantOutcome>((resolve) => {
          release = () => resolve({ status: "success" });
        }),
    );
    render(
      <PermissionGrantsEditor
        permissions={PERMISSIONS}
        grants={[]}
        onAddGrant={onAddGrant}
        onRemoveGrant={vi.fn()}
      />,
    );

    const pendingButton = scopeButton("role.read", "Organization", false);
    await user.click(pendingButton);

    expect(pendingButton).toBeDisabled();
    expect(
      scopeButton("role.create", "Organization", false),
    ).not.toBeDisabled();

    release?.();
    await waitFor(() => expect(pendingButton).not.toBeDisabled());
  });
});
