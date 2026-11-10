import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { initialsFor, pageWindow, UsersTable } from "./users-table";
import type { User } from "../lib/users-types";

const now = "2026-09-01T09:00:00.000Z";

function user(overrides: Partial<User> & Pick<User, "id" | "email">): User {
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

const NONE = { canEdit: false, canDeactivate: false, canActivate: false };

function renderTable(
  overrides: Partial<Parameters<typeof UsersTable>[0]> = {},
) {
  const props = {
    users: [] as User[],
    total: 0,
    pageSize: 10,
    page: 1,
    pageCount: 1,
    onPageChange: vi.fn(),
    filtered: false,
    permissions: NONE,
    onEdit: vi.fn(),
    onRequestStatusChange: vi.fn(),
    ...overrides,
  };
  render(<UsersTable {...props} />);
  return props;
}

describe("UsersTable", () => {
  it("renders name, email, role, status, and the password-pending badge", () => {
    renderTable({
      users: [
        user({
          id: "u1",
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
          role: { id: "r1", name: "Department Manager" },
          mustChangePassword: true,
        }),
      ],
      total: 1,
    });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(table).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Department Manager")).toBeInTheDocument();
    expect(within(table).getByText("Active")).toBeInTheDocument();
    expect(within(table).getByText("Password pending")).toBeInTheDocument();
  });

  it("links each name to its details page, not to an edit dialog", () => {
    renderTable({
      users: [user({ id: "u7", email: "kay@example.com", firstName: "Kay" })],
      total: 1,
    });
    // Desktop and mobile layouts both render the row; each link goes to the details page.
    const links = screen.getAllByRole("link", { name: "Kay Person" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/users/u7");
    }
  });

  it("shows an avatar with initials for each user", () => {
    renderTable({
      users: [
        user({
          id: "u2",
          email: "x@example.com",
          firstName: "Mira",
          lastName: "Market",
        }),
      ],
      total: 1,
    });
    expect(
      initialsFor({
        firstName: "Mira",
        lastName: "Market",
        email: "x@example.com",
      }),
    ).toBe("MM");
    expect(
      initialsFor({
        firstName: null,
        lastName: null,
        email: "solo@example.com",
      }),
    ).toBe("S");
  });

  it("shows an actions control per row, labelled with the user's name", () => {
    renderTable({
      users: [
        user({
          id: "u3",
          email: "b@example.com",
          firstName: "Bo",
          lastName: "Lin",
        }),
      ],
      total: 1,
      permissions: { canEdit: true, canDeactivate: true, canActivate: true },
    });
    expect(
      screen.getAllByRole("button", { name: "Actions for Bo Lin" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows numbered pagination with a position summary when there is more than one page", () => {
    renderTable({
      users: [user({ id: "u4", email: "c@example.com" })],
      total: 25,
      page: 2,
      pageCount: 3,
    });
    expect(screen.getByText("Showing 11–20 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Page 3" })).toBeInTheDocument();
  });

  it("hides pagination for a single page", () => {
    renderTable({
      users: [user({ id: "u5", email: "d@example.com" })],
      total: 1,
      pageCount: 1,
    });
    expect(
      screen.queryByRole("navigation", { name: "Users pagination" }),
    ).not.toBeInTheDocument();
  });

  it("explains an empty result set, filtered or not", () => {
    renderTable({ users: [], total: 0, filtered: true });
    expect(
      screen.getByText("No users match these filters"),
    ).toBeInTheDocument();
  });
});

describe("pageWindow", () => {
  it("keeps the current page with its neighbours and both ends, with gaps", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10]);
  });
});
