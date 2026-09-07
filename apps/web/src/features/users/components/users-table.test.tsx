import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UsersTable } from "./users-table";
import type { User } from "../lib/users-types";

const now = "2026-09-01T09:00:00.000Z";

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

const USERS: User[] = [
  makeUser({
    id: "u1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    role: { id: "r1", name: "Super Admin" },
  }),
  makeUser({
    id: "u2",
    email: "grace@example.com",
    firstName: "Grace",
    lastName: "Hopper",
    status: "INACTIVE",
    mustChangePassword: true,
  }),
  makeUser({
    id: "u3",
    email: "no.name@example.com",
    firstName: null,
    lastName: null,
  }),
];

function noop() {
  /* no-op */
}

describe("UsersTable", () => {
  it("shows the plain empty state with no users", () => {
    render(
      <UsersTable
        users={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getByText("No users yet")).toBeVisible();
  });

  it("shows a filter-specific empty state", () => {
    render(
      <UsersTable
        users={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered
      />,
    );
    expect(screen.getByText("No users match these filters")).toBeVisible();
  });

  it("renders name, email, role, status, and the password-pending badge", () => {
    render(
      <UsersTable
        users={USERS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getAllByText("Ada Lovelace")[0]).toBeVisible();
    expect(screen.getAllByText("ada@example.com")[0]).toBeVisible();
    expect(screen.getAllByText("Super Admin")[0]).toBeVisible();
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Password pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unnamed user")[0]).toBeVisible();
  });

  it("selects a user by activating its name, including via keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <UsersTable
        users={USERS}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    const [button] = screen.getAllByRole("button", { name: "Ada Lovelace" });
    button!.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("u1");
  });

  it("shows pagination only when there is more than one page and reports position", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <UsersTable
        users={USERS}
        onSelect={noop}
        page={2}
        pageCount={3}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("hides pagination for a single page", () => {
    render(
      <UsersTable
        users={USERS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Users pagination" }),
    ).not.toBeInTheDocument();
  });
});
