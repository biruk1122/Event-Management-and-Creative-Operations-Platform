import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserDetailDialog } from "./user-detail-dialog";
import type {
  AssignRoleOutcome,
  DeactivateUserOutcome,
  ReactivateUserOutcome,
  SaveUserOutcome,
} from "../lib/users-outcome";
import type { User, UserRoleSummary } from "../lib/users-types";

// The dialog default-imports the gateway for its `getUser` fallback; every test
// supplies `getUser` explicitly, so a bare stub keeps the env module out.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

const now = "2026-09-01T09:00:00.000Z";
const ROLES: UserRoleSummary[] = [
  { id: "role-1", name: "Team Member" },
  { id: "role-2", name: "Super Admin" },
];

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+1 555 0000",
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: ROLES[0]!,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseProps(user: User) {
  return {
    userId: user.id,
    onOpenChange: vi.fn(),
    roles: ROLES,
    getUser: vi.fn((): Promise<User | null> => Promise.resolve(user)),
    onUpdate: vi.fn((): Promise<SaveUserOutcome> =>
      Promise.resolve({ status: "success", user }),
    ),
    onDeactivate: vi.fn((): Promise<DeactivateUserOutcome> =>
      Promise.resolve({
        status: "success",
        user: { ...user, status: "INACTIVE", deactivatedAt: now },
      }),
    ),
    onReactivate: vi.fn((): Promise<ReactivateUserOutcome> =>
      Promise.resolve({
        status: "success",
        user: { ...user, status: "ACTIVE", deactivatedAt: null },
      }),
    ),
    onAssignRole: vi.fn((): Promise<AssignRoleOutcome> =>
      Promise.resolve({ status: "success", user }),
    ),
    onChanged: vi.fn(),
  };
}

describe("UserDetailDialog", () => {
  it("shows a loading state before the user resolves", () => {
    const props = baseProps(makeUser());
    let resolve: (() => void) | undefined;
    props.getUser = vi.fn(
      () =>
        new Promise<User>((r) => {
          resolve = () => r(makeUser());
        }),
    );
    render(<UserDetailDialog {...props} />);
    expect(screen.getByText("Loading user…")).toBeVisible();
    resolve?.();
  });

  it("loads and shows the profile, status badge, and email", async () => {
    render(<UserDetailDialog {...baseProps(makeUser())} />);
    expect(await screen.findByDisplayValue("Ada")).toBeVisible();
    expect(screen.getByDisplayValue("ada@example.com")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
  });

  it("keeps Save disabled until a field changes, then sends only the change", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeUser());
    render(<UserDetailDialog {...props} />);

    const firstName = await screen.findByLabelText("First name");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(firstName);
    await user.type(firstName, "Augusta");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith("user-1", {
        firstName: "Augusta",
      }),
    );
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("confirms before deactivating and reports success", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeUser());
    render(<UserDetailDialog {...props} />);

    await screen.findByDisplayValue("Ada");
    await user.click(screen.getByRole("button", { name: "Deactivate user" }));
    expect(props.onDeactivate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirm deactivate" }),
    );
    await waitFor(() =>
      expect(props.onDeactivate).toHaveBeenCalledWith("user-1"),
    );
  });

  it("offers reactivate for an inactive user and shows the deactivated date", async () => {
    const user = userEvent.setup();
    const props = baseProps(
      makeUser({ status: "INACTIVE", deactivatedAt: "2026-08-15T00:00:00Z" }),
    );
    render(<UserDetailDialog {...props} />);

    await screen.findByDisplayValue("Ada");
    expect(screen.getByText(/deactivated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reactivate user" }));
    await waitFor(() =>
      expect(props.onReactivate).toHaveBeenCalledWith("user-1"),
    );
  });

  it("surfaces an 'already inactive' error without closing", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeUser());
    props.onDeactivate = vi.fn((): Promise<DeactivateUserOutcome> =>
      Promise.resolve({ status: "already_inactive" }),
    );
    render(<UserDetailDialog {...props} />);

    await screen.findByDisplayValue("Ada");
    await user.click(screen.getByRole("button", { name: "Deactivate user" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm deactivate" }),
    );

    expect(
      await screen.findByText("This user is already deactivated."),
    ).toBeVisible();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("assigns a role through the select", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeUser({ role: null }));
    render(<UserDetailDialog {...props} />);

    await screen.findByDisplayValue("Ada");
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Super Admin" }),
    );

    await waitFor(() =>
      expect(props.onAssignRole).toHaveBeenCalledWith("user-1", "role-2"),
    );
  });

  it("clears the role when 'No role' is chosen", async () => {
    const user = userEvent.setup();
    const props = baseProps(makeUser());
    render(<UserDetailDialog {...props} />);

    await screen.findByDisplayValue("Ada");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /no role/i }));

    await waitFor(() =>
      expect(props.onAssignRole).toHaveBeenCalledWith("user-1", null),
    );
  });

  it("shows an error state when the user cannot be loaded", async () => {
    const props = baseProps(makeUser());
    props.getUser = vi.fn(() => Promise.resolve(null));
    render(<UserDetailDialog {...props} />);
    expect(
      await screen.findByText("We could not load this user"),
    ).toBeVisible();
  });
});
