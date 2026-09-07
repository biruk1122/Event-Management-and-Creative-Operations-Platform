import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DepartmentsTable } from "./departments-table";
import type { Department } from "../lib/departments-types";

const now = "2026-09-01T09:00:00.000Z";

function makeDepartment(
  overrides: Partial<Department> & Pick<Department, "id" | "name">,
): Department {
  return {
    description: null,
    manager: null,
    employeeCount: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const DEPARTMENTS: Department[] = [
  makeDepartment({
    id: "d1",
    name: "Event Management",
    employeeCount: 14,
    manager: {
      id: "m1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
  }),
  makeDepartment({
    id: "d2",
    name: "Promotion",
    deactivatedAt: "2026-08-20T12:00:00.000Z",
  }),
];

function noop() {
  /* no-op */
}

describe("DepartmentsTable", () => {
  it("shows the plain empty state with no departments", () => {
    render(
      <DepartmentsTable
        departments={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getByText("No departments yet")).toBeVisible();
  });

  it("shows a filter-specific empty state", () => {
    render(
      <DepartmentsTable
        departments={[]}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered
      />,
    );
    expect(
      screen.getByText("No departments match these filters"),
    ).toBeVisible();
  });

  it("renders name, manager, employee count, and status", () => {
    render(
      <DepartmentsTable
        departments={DEPARTMENTS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(screen.getAllByText("Event Management")[0]).toBeVisible();
    expect(screen.getAllByText("Morgan Lead")[0]).toBeVisible();
    expect(screen.getAllByText("14")[0]).toBeVisible();
    expect(screen.getAllByText("Unassigned")[0]).toBeVisible();
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
  });

  it("selects a department by activating its name via keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DepartmentsTable
        departments={DEPARTMENTS}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    const [button] = screen.getAllByRole("button", {
      name: "Event Management",
    });
    button!.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("d1");
  });

  it("shows pagination only beyond one page and reports position", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DepartmentsTable
        departments={DEPARTMENTS}
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
      <DepartmentsTable
        departments={DEPARTMENTS}
        onSelect={noop}
        page={1}
        pageCount={1}
        onPageChange={noop}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Departments pagination" }),
    ).not.toBeInTheDocument();
  });
});
