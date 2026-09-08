import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateTeamDialog } from "./create-team-dialog";
import type { CreateTeam, SaveTeamOutcome } from "../lib/teams-outcome";
import type {
  AssignableDepartment,
  AssignableUser,
  Team,
} from "../lib/teams-types";

const now = "2026-09-01T09:00:00.000Z";

const DEPARTMENTS: AssignableDepartment[] = [
  { id: "dep-1", name: "Production" },
  { id: "dep-2", name: "Marketing" },
];

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

const CREATED: Team = {
  id: "new-team",
  name: "Production Team",
  description: null,
  department: DEPARTMENTS[0]!,
  manager: null,
  members: [],
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
};

function setup(onCreate: CreateTeam) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateTeamDialog
      open
      onOpenChange={onOpenChange}
      departments={DEPARTMENTS}
      managers={MANAGERS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { user, onOpenChange, onCreated };
}

const resolvesTo = (outcome: SaveTeamOutcome): CreateTeam =>
  vi.fn(() => Promise.resolve(outcome));

async function chooseDepartment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Department" }));
  await user.click(await screen.findByRole("option", { name: "Production" }));
}

describe("CreateTeamDialog", () => {
  it("blocks submission until a department is chosen", async () => {
    const onCreate = resolvesTo({ status: "success", team: CREATED });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Production Team");
    await user.click(screen.getByRole("button", { name: "Create team" }));

    expect(await screen.findByText("Choose a department.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("submits the name and department and reports the created team", async () => {
    const onCreate = resolvesTo({ status: "success", team: CREATED });
    const { user, onCreated, onOpenChange } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Production Team");
    await chooseDepartment(user);
    await user.click(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Production Team",
          departmentId: "dep-1",
          description: "",
          managerId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes the chosen manager id", async () => {
    const onCreate = resolvesTo({ status: "success", team: CREATED });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Event Team");
    await chooseDepartment(user);
    await user.click(
      screen.getByRole("combobox", { name: "Manager (optional)" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await user.click(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ managerId: "user-2" }),
      ),
    );
  });

  it("shows a name-conflict error and keeps the typed value", async () => {
    const onCreate = resolvesTo({ status: "name_conflict" });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Marketing Team");
    await chooseDepartment(user);
    await user.click(screen.getByRole("button", { name: "Create team" }));

    expect(
      await screen.findByText(
        "That department already has a team with this name.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Marketing Team");
  });

  it.each([
    ["permission_denied", "You do not have permission to create a team."],
    ["department_not_found", "That department no longer exists. Pick another."],
    ["unexpected", "We could not create the team. Try again."],
  ] as const)("surfaces the %s state", async (status, message) => {
    const onCreate = resolvesTo({ status });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Ops Team");
    await chooseDepartment(user);
    await user.click(screen.getByRole("button", { name: "Create team" }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("closes on Cancel without calling onCreate", async () => {
    const onCreate = resolvesTo({ status: "unexpected" });
    const { user, onOpenChange } = setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
