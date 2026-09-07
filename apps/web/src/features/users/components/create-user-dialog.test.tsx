import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateUserDialog } from "./create-user-dialog";
import type { CreateUser, SaveUserOutcome } from "../lib/users-outcome";
import type { User, UserRoleSummary } from "../lib/users-types";

const now = "2026-09-01T09:00:00.000Z";
const ROLES: UserRoleSummary[] = [
  { id: "role-1", name: "Team Member" },
  { id: "role-2", name: "Super Admin" },
];

const CREATED: User = {
  id: "new-user",
  email: "new@example.com",
  firstName: "New",
  lastName: "User",
  phone: null,
  profileImage: null,
  status: "ACTIVE",
  deactivatedAt: null,
  role: null,
  mustChangePassword: true,
  createdAt: now,
  updatedAt: now,
};

function setup(onCreate: CreateUser) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateUserDialog
      open
      onOpenChange={onOpenChange}
      roles={ROLES}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { user, onOpenChange, onCreated };
}

const resolvesTo = (outcome: SaveUserOutcome): CreateUser =>
  vi.fn(() => Promise.resolve(outcome));

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name"), "New");
  await user.type(screen.getByLabelText("Last name"), "User");
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(
    screen.getByLabelText("Temporary password"),
    "temp-password-1",
  );
}

describe("CreateUserDialog", () => {
  it("submits the typed values and reports the created user", async () => {
    const onCreate = resolvesTo({ status: "success", user: CREATED });
    const { user, onCreated, onOpenChange } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          firstName: "New",
          lastName: "User",
          temporaryPassword: "temp-password-1",
          roleId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes the chosen role id", async () => {
    const onCreate = resolvesTo({ status: "success", user: CREATED });
    const { user } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Super Admin" }),
    );
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: "role-2" }),
      ),
    );
  });

  it("shows an email-conflict error and keeps the typed values", async () => {
    const onCreate = resolvesTo({ status: "email_conflict" });
    const { user } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(
      await screen.findByText("A user with that email already exists."),
    ).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("new@example.com");
    expect(screen.getByLabelText("First name")).toHaveValue("New");
  });

  it("maps field errors onto the inputs", async () => {
    const onCreate = resolvesTo({
      status: "field_errors",
      fieldErrors: { email: "That address is not allowed." },
    });
    const { user } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(
      await screen.findByText("That address is not allowed."),
    ).toBeVisible();
  });

  it.each([
    ["permission_denied", "You do not have permission to create a user."],
    ["unexpected", "We could not create the user. Try again."],
  ] as const)("surfaces the %s state", async (status, message) => {
    const onCreate = resolvesTo({ status });
    const { user } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("disables submit while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const onCreate: CreateUser = vi.fn(
      () =>
        new Promise<SaveUserOutcome>((resolve) => {
          release = () => resolve({ status: "success", user: CREATED });
        }),
    );
    const { user } = setup(onCreate);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Create user" }));

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
