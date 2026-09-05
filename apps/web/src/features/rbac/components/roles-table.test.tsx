import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RolesTable } from "./roles-table";
import type { Role } from "../lib/rbac-types";

const now = "2026-09-01T09:00:00.000Z";

const ROLES: Role[] = [
  {
    id: "role-1",
    name: "Super Admin",
    description: "Holds every permission.",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "role-2",
    name: "Regional Coordinator",
    description: "Coordinates activity across one region.",
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  },
];

describe("RolesTable", () => {
  it("shows an empty state with no roles", () => {
    render(<RolesTable roles={[]} onSelect={vi.fn()} />);

    expect(screen.getByText("No roles yet")).toBeVisible();
  });

  it("lists every role's name, description, and system badge", () => {
    render(<RolesTable roles={ROLES} onSelect={vi.fn()} />);

    const superAdminNames = screen.getAllByText("Super Admin");
    expect(superAdminNames.length).toBeGreaterThan(0);
    const systemBadges = screen.getAllByText("System");
    expect(systemBadges.length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Coordinates activity across one region.")[0],
    ).toBeVisible();
  });

  it("does not mark a custom role as System", () => {
    render(<RolesTable roles={ROLES} onSelect={vi.fn()} />);

    const coordinatorRows = screen.getAllByText("Regional Coordinator");
    for (const node of coordinatorRows) {
      expect(node.parentElement?.textContent).not.toContain("System");
    }
  });

  it("calls onSelect with the role id when its name is activated", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RolesTable roles={ROLES} onSelect={onSelect} />);

    const [nameButton] = screen.getAllByRole("button", {
      name: "Regional Coordinator",
    });
    await user.click(nameButton!);

    expect(onSelect).toHaveBeenCalledWith("role-2");
  });

  it("supports keyboard activation of a role", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RolesTable roles={ROLES} onSelect={onSelect} />);

    const [nameButton] = screen.getAllByRole("button", { name: "Super Admin" });
    nameButton!.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("role-1");
  });
});
