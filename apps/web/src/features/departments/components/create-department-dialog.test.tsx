import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateDepartmentDialog } from "./create-department-dialog";
import type {
  CreateDepartment,
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

const CREATED: Department = {
  id: "new-dep",
  name: "Event Management",
  description: null,
  manager: null,
  employeeCount: 0,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
};

function setup(onCreate: CreateDepartment) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateDepartmentDialog
      open
      onOpenChange={onOpenChange}
      managers={MANAGERS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { user, onOpenChange, onCreated };
}

const resolvesTo = (outcome: SaveDepartmentOutcome): CreateDepartment =>
  vi.fn(() => Promise.resolve(outcome));

describe("CreateDepartmentDialog", () => {
  it("submits the typed name and reports the created department", async () => {
    const onCreate = resolvesTo({ status: "success", department: CREATED });
    const { user, onCreated, onOpenChange } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Event Management");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Event Management",
          description: "",
          managerId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes the chosen manager id", async () => {
    const onCreate = resolvesTo({ status: "success", department: CREATED });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Production");
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await user.click(screen.getByRole("button", { name: "Create department" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ managerId: "user-2" }),
      ),
    );
  });

  it("shows a name-conflict error and keeps the typed value", async () => {
    const onCreate = resolvesTo({ status: "name_conflict" });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Marketing");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    expect(
      await screen.findByText("A department with that name already exists."),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Marketing");
  });

  it("maps field errors onto the inputs", async () => {
    const onCreate = resolvesTo({
      status: "field_errors",
      fieldErrors: { name: "That name is reserved." },
    });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "System");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    expect(await screen.findByText("That name is reserved.")).toBeVisible();
  });

  it.each([
    ["permission_denied", "You do not have permission to create a department."],
    ["unexpected", "We could not create the department. Try again."],
  ] as const)("surfaces the %s state", async (status, message) => {
    const onCreate = resolvesTo({ status });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Ops");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("disables submit while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const onCreate: CreateDepartment = vi.fn(
      () =>
        new Promise<SaveDepartmentOutcome>((resolve) => {
          release = () => resolve({ status: "success", department: CREATED });
        }),
    );
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Slow");
    await user.click(screen.getByRole("button", { name: "Create department" }));

    expect(
      await screen.findByRole("button", { name: /creating/i }),
    ).toBeDisabled();
    release?.();
  });

  it("closes on Cancel without calling onCreate", async () => {
    const onCreate = resolvesTo({ status: "unexpected" });
    const { user, onOpenChange } = setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
