import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DepartmentsManager } from "./departments-manager";
import type {
  DeleteDepartmentOutcome,
  SaveDepartmentOutcome,
} from "../lib/departments-outcome";
import type {
  AssignableUser,
  Department,
  PaginatedDepartments,
} from "../lib/departments-types";

const now = "2026-09-01T09:00:00.000Z";
const MANAGERS: AssignableUser[] = [
  {
    id: "m1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

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

function page(items: Department[]): PaginatedDepartments {
  return { items, page: 1, pageSize: 25, total: items.length };
}

const THREE = [
  makeDepartment({ id: "d1", name: "Event Management", employeeCount: 4 }),
  makeDepartment({
    id: "d2",
    name: "Promotion",
    deactivatedAt: "2026-08-20T12:00:00.000Z",
  }),
  makeDepartment({ id: "d3", name: "Marketing", employeeCount: 2 }),
];

describe("DepartmentsManager", () => {
  it("shows the count and lists the initial page", () => {
    render(
      <DepartmentsManager initialPage={page(THREE)} managers={MANAGERS} />,
    );
    expect(screen.getByText("3 departments")).toBeVisible();
    expect(screen.getAllByText("Event Management")[0]).toBeVisible();
  });

  it("filters the list by the search term", async () => {
    const user = userEvent.setup();
    render(
      <DepartmentsManager initialPage={page(THREE)} managers={MANAGERS} />,
    );

    await user.type(screen.getByLabelText("Search"), "market");
    expect(screen.getAllByText("Marketing")[0]).toBeVisible();
    expect(screen.queryByText("Event Management")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(
      <DepartmentsManager initialPage={page(THREE)} managers={MANAGERS} />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));

    expect(screen.getAllByText("Promotion")[0]).toBeVisible();
    expect(screen.queryByText("Event Management")).not.toBeInTheDocument();
  });

  it("opens the create dialog and adds a department on success", async () => {
    const user = userEvent.setup();
    const created = makeDepartment({ id: "d4", name: "New Unit" });
    const createDepartment = vi.fn((): Promise<SaveDepartmentOutcome> =>
      Promise.resolve({ status: "success", department: created }),
    );

    render(
      <DepartmentsManager
        initialPage={page(THREE)}
        managers={MANAGERS}
        createDepartment={createDepartment}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New department" }));
    await user.type(screen.getByLabelText("Name"), "New Unit");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    await waitFor(() =>
      expect(screen.getByText("4 departments")).toBeVisible(),
    );
    expect(screen.getAllByText("New Unit")[0]).toBeVisible();
  });

  it("opens the detail dialog for the selected department", async () => {
    const user = userEvent.setup();
    const getDepartment = vi.fn((id: string) =>
      Promise.resolve(THREE.find((d) => d.id === id) ?? null),
    );
    render(
      <DepartmentsManager
        initialPage={page(THREE)}
        managers={MANAGERS}
        getDepartment={getDepartment}
      />,
    );

    const [name] = screen.getAllByRole("button", { name: "Event Management" });
    await user.click(name!);

    expect(getDepartment).toHaveBeenCalledWith("d1");
    expect(
      await screen.findByRole("heading", { name: "Event Management" }),
    ).toBeVisible();
  });

  it("removes a department from the list after a successful delete", async () => {
    const user = userEvent.setup();
    const getDepartment = vi.fn((id: string) =>
      Promise.resolve(THREE.find((d) => d.id === id) ?? null),
    );
    const deleteDepartment = vi.fn((): Promise<DeleteDepartmentOutcome> =>
      Promise.resolve({ status: "success" }),
    );
    render(
      <DepartmentsManager
        initialPage={page(THREE)}
        managers={MANAGERS}
        getDepartment={getDepartment}
        deleteDepartment={deleteDepartment}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Marketing" })[0]!);
    await screen.findByRole("heading", { name: "Marketing" });
    await user.click(screen.getByRole("button", { name: "Delete department" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(screen.getByText("2 departments")).toBeVisible(),
    );
  });

  it("paginates when there are more than ten matches", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeDepartment({ id: `p${index}`, name: `Unit ${index}` }),
    );
    render(<DepartmentsManager initialPage={page(many)} managers={MANAGERS} />);
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
  });
});
