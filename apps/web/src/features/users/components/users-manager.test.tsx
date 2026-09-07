import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UsersManager } from "./users-manager";
import type { SaveUserOutcome } from "../lib/users-outcome";
import type { PaginatedUsers, User, UserRoleSummary } from "../lib/users-types";

const now = "2026-09-01T09:00:00.000Z";
const ROLES: UserRoleSummary[] = [{ id: "role-1", name: "Team Member" }];

function makeUser(overrides: Partial<User> & Pick<User, "id" | "email">): User {
  return {
    firstName: "Test",
    lastName: "Person",
    phone: null,
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: null,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function page(items: User[]): PaginatedUsers {
  return { items, page: 1, pageSize: 25, total: items.length };
}

const THREE = [
  makeUser({
    id: "u1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  }),
  makeUser({
    id: "u2",
    email: "grace@example.com",
    firstName: "Grace",
    lastName: "Hopper",
    status: "INACTIVE",
  }),
  makeUser({
    id: "u3",
    email: "kat@example.com",
    firstName: "Kat",
    lastName: "Johnson",
  }),
];

describe("UsersManager", () => {
  it("shows the user count and lists the initial page", () => {
    render(<UsersManager initialPage={page(THREE)} roles={ROLES} />);
    expect(screen.getByText("3 users")).toBeVisible();
    expect(screen.getAllByText("Ada Lovelace")[0]).toBeVisible();
  });

  it("filters the list by the search term", async () => {
    const user = userEvent.setup();
    render(<UsersManager initialPage={page(THREE)} roles={ROLES} />);

    await user.type(screen.getByLabelText("Search"), "grace");
    expect(screen.getAllByText("Grace Hopper")[0]).toBeVisible();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<UsersManager initialPage={page(THREE)} roles={ROLES} />);

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));

    expect(screen.getAllByText("Grace Hopper")[0]).toBeVisible();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("opens the create dialog and adds a user on success", async () => {
    const user = userEvent.setup();
    const created = makeUser({
      id: "u4",
      email: "new@example.com",
      firstName: "New",
      lastName: "Hire",
    });
    const createUser = vi.fn((): Promise<SaveUserOutcome> =>
      Promise.resolve({ status: "success", user: created }),
    );

    render(
      <UsersManager
        initialPage={page(THREE)}
        roles={ROLES}
        createUser={createUser}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New user" }));
    await user.type(screen.getByLabelText("First name"), "New");
    await user.type(screen.getByLabelText("Last name"), "Hire");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(
      screen.getByLabelText("Temporary password"),
      "temp-password-1",
    );
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => expect(screen.getByText("4 users")).toBeVisible());
    expect(screen.getAllByText("New Hire")[0]).toBeVisible();
  });

  it("opens the detail dialog for the selected user", async () => {
    const user = userEvent.setup();
    const getUser = vi.fn((id: string) =>
      Promise.resolve(THREE.find((u) => u.id === id) ?? null),
    );
    render(
      <UsersManager
        initialPage={page(THREE)}
        roles={ROLES}
        getUser={getUser}
      />,
    );

    const [name] = screen.getAllByRole("button", { name: "Ada Lovelace" });
    await user.click(name!);

    expect(getUser).toHaveBeenCalledWith("u1");
    expect(
      await screen.findByRole("heading", { name: "Ada Lovelace" }),
    ).toBeVisible();
  });

  it("paginates when there are more than ten matches", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeUser({
        id: `p${index}`,
        email: `person${index}@example.com`,
        firstName: `Person${index}`,
        lastName: "X",
      }),
    );
    render(<UsersManager initialPage={page(many)} roles={ROLES} />);
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
  });
});
