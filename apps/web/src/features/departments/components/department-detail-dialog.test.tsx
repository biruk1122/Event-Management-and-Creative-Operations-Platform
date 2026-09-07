import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DepartmentDetailDialog } from "./department-detail-dialog";
import type {
  AssignManagerOutcome,
  DeactivateDepartmentOutcome,
  DeleteDepartmentOutcome,
  ReactivateDepartmentOutcome,
  SaveDepartmentOutcome,
} from "../lib/departments-outcome";
import type { AssignableUser, Department } from "../lib/departments-types";

const now = "2026-09-01T09:00:00.000Z";

const MANAGERS: AssignableUser[] = [
  {
    id: "user-1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "user-2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
];

function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: "dep-1",
    name: "Event Management",
    description: "Owns events.",
    manager: {
      id: "user-1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    employeeCount: 3,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseProps(department: Department) {
  return {
    departmentId: department.id,
    onOpenChange: vi.fn(),
    managers: MANAGERS,
    getDepartment: vi.fn((): Promise<Department | null> =>
      Promise.resolve(department),
    ),
    onUpdate: vi.fn((): Promise<SaveDepartmentOutcome> =>
      Promise.resolve({ status: "success", department }),
    ),
    onAssignManager: vi.fn((): Promise<AssignManagerOutcome> =>
      Promise.resolve({ status: "success", department }),
    ),
    onDeactivate: vi.fn((): Promise<DeactivateDepartmentOutcome> =>
      Promise.resolve({
        status: "success",
        department: { ...department, deactivatedAt: now },
      }),
    ),
    onReactivate: vi.fn((): Promise<ReactivateDepartmentOutcome> =>
      Promise.resolve({
        status: "success",
        department: { ...department, deactivatedAt: null },
      }),
    ),
    onDelete: vi.fn((): Promise<DeleteDepartmentOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
  };
}

describe("DepartmentDetailDialog", () => {
  it("shows a loading state before the department resolves", () => {
    const props = baseProps(makeDepartment());
    let resolve: (() => void) | undefined;
    props.getDepartment = vi.fn(
      () =>
        new Promise<Department>((r) => {
          resolve = () => r(makeDepartment());
        }),
    );
    render(<DepartmentDetailDialog {...props} />);
    expect(screen.getByText("Loading department…")).toBeVisible();
    resolve?.();
  });

  it("loads and shows the name, description, status, and employee count", async () => {
    render(<DepartmentDetailDialog {...baseProps(makeDepartment())} />);
    expect(await screen.findByDisplayValue("Event Management")).toBeVisible();
    expect(screen.getByDisplayValue("Owns events.")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText(/3 employees/)).toBeVisible();
  });

  it("keeps Save disabled until a field changes, then sends only the change", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeDepartment());
    render(<DepartmentDetailDialog {...props} />);

    const name = await screen.findByLabelText("Name");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, "Events");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith("dep-1", { name: "Events" }),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("confirms before deactivating and reports success", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeDepartment());
    render(<DepartmentDetailDialog {...props} />);

    await screen.findByDisplayValue("Event Management");
    await user.click(
      screen.getByRole("button", { name: "Deactivate department" }),
    );
    expect(props.onDeactivate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirm deactivate" }),
    );
    await waitFor(() =>
      expect(props.onDeactivate).toHaveBeenCalledWith("dep-1"),
    );
  });

  it("offers reactivate for an inactive department and shows the date", async () => {
    const user = userEvent.setup();
    const props = baseProps(
      makeDepartment({ deactivatedAt: "2026-08-15T00:00:00Z" }),
    );
    render(<DepartmentDetailDialog {...props} />);

    await screen.findByDisplayValue("Event Management");
    expect(screen.getByText(/deactivated/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reactivate department" }),
    );
    await waitFor(() =>
      expect(props.onReactivate).toHaveBeenCalledWith("dep-1"),
    );
  });

  it("assigns and clears the manager through the select", async () => {
    const user = userEvent.setup();
    const base = makeDepartment({ manager: null });
    // Echo the chosen manager back so the control reflects the settled change.
    const onAssignManager = vi.fn(
      (id: string, managerId: string | null): Promise<AssignManagerOutcome> =>
        Promise.resolve({
          status: "success",
          department: {
            ...base,
            id,
            manager: managerId
              ? MANAGERS.find((manager) => manager.id === managerId)!
              : null,
          },
        }),
    );
    const props = { ...baseProps(base), onAssignManager };
    render(<DepartmentDetailDialog {...props} />);

    await screen.findByDisplayValue("Event Management");
    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await waitFor(() =>
      expect(onAssignManager).toHaveBeenCalledWith("dep-1", "user-2"),
    );

    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(await screen.findByRole("option", { name: "No manager" }));
    await waitFor(() =>
      expect(onAssignManager).toHaveBeenLastCalledWith("dep-1", null),
    );
  });

  it("confirms before deleting and reports the removal", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeDepartment());
    render(<DepartmentDetailDialog {...props} />);

    await screen.findByDisplayValue("Event Management");
    await user.click(screen.getByRole("button", { name: "Delete department" }));
    expect(props.onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("dep-1"));
    expect(props.onDeleted).toHaveBeenCalledWith("dep-1");
  });

  it("surfaces an in-use error when a delete is refused", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeDepartment());
    props.onDelete = vi.fn((): Promise<DeleteDepartmentOutcome> =>
      Promise.resolve({ status: "in_use" }),
    );
    render(<DepartmentDetailDialog {...props} />);

    await screen.findByDisplayValue("Event Management");
    await user.click(screen.getByRole("button", { name: "Delete department" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(
      await screen.findByText(
        "This department still has employees and cannot be removed.",
      ),
    ).toBeVisible();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("shows an error state when the department cannot be loaded", async () => {
    const props = baseProps(makeDepartment());
    props.getDepartment = vi.fn(() => Promise.resolve(null));
    render(<DepartmentDetailDialog {...props} />);
    expect(
      await screen.findByText("We could not load this department"),
    ).toBeVisible();
  });
});
