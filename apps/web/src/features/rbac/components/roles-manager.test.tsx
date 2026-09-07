import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { RolesManager } from "./roles-manager";
import type { Role, RoleWithGrants } from "../lib/rbac-types";

const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: remove },
}));
const access: CurrentAccess = {
  userId: "account-1",
  grants: ["read", "create", "update", "delete", "configure_permissions"].map(
    (key) => ({ permissionKey: `role.${key}`, scope: "ORGANIZATION" }),
  ),
};
const role: RoleWithGrants = {
  id: "role-1",
  name: "Regional Coordinator",
  description: "Regional work",
  isSystem: false,
  createdAt: "2026-09-01T09:00:00Z",
  updatedAt: "2026-09-01T09:00:00Z",
  grants: [],
};
let roles: Role[];
let detail: RoleWithGrants;
const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const denied = () => ({
  error: { code: "PERMISSION_DENIED", status: 403 },
  response: { ok: false, status: 403 },
});
function setup(currentAccess = access) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RolesManager access={currentAccess} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  roles = [role];
  detail = { ...role, grants: [] };
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/roles") return ok(roles);
    if (path === "/api/v1/permissions")
      return ok([{ key: "role.read", description: "Read roles" }]);
    return ok(detail);
  });
});

describe("RolesManager API integration", () => {
  it("loads authoritative roles and paginates/searches the authorized list", async () => {
    roles = Array.from({ length: 11 }, (_, i) => ({
      ...role,
      id: `role-${i}`,
      name: `Role ${i}`,
    }));
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText("11 roles")).toBeVisible();
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Role 10" }).length,
    ).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("Search roles"), "Role 0");
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Role 0" }).length,
    ).toBeGreaterThan(0);
  });

  it("creates a role and reloads the list from the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("1 role");
    post.mockImplementation(async () => {
      roles = [...roles, { ...role, id: "new", name: "New Role" }];
      return ok(roles[1], 201);
    });
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.type(screen.getByLabelText("Name"), "New Role");
    await user.click(screen.getByRole("button", { name: "Create role" }));
    expect(await screen.findByText("2 roles")).toBeVisible();
    expect(
      get.mock.calls.filter(([path]) => path === "/api/v1/roles"),
    ).toHaveLength(2);
  });

  it("preserves the name and description after a recoverable failure", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("1 role");
    post.mockRejectedValue(new TypeError("Network unavailable"));
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.type(screen.getByLabelText("Name"), "Draft name");
    await user.type(screen.getByLabelText("Description"), "Draft description");
    await user.click(screen.getByRole("button", { name: "Create role" }));
    expect(
      await screen.findByText("We could not create the role. Try again."),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Draft name");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Draft description",
    );
    expect(screen.getByRole("button", { name: "Create role" })).toBeEnabled();
  });

  it("reconciles grant conflicts from the API without losing an edited name", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("1 role");
    await user.click(screen.getAllByRole("button", { name: role.name })[0]!);
    const name = await screen.findByLabelText("Name");
    await user.type(name, " draft");
    post.mockImplementation(async () => {
      detail = {
        ...detail,
        grants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
      };
      return {
        error: { code: "GRANT_ALREADY_EXISTS", status: 409 },
        response: { ok: false, status: 409 },
      };
    });
    await user.click(
      screen.getByRole("button", {
        name: "Grant role.read at Organization scope",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Revoke role.read at Organization scope",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(name).toHaveValue(`${role.name} draft`);
    expect(await screen.findByText("That grant already exists.")).toBeVisible();
  });

  it("clamps pagination after deleting the last role on a page", async () => {
    roles = Array.from({ length: 11 }, (_, i) => ({
      ...role,
      id: `role-${i}`,
      name: `Role ${i}`,
    }));
    detail = { ...role, ...roles[10]!, grants: [] };
    remove.mockImplementation(async () => {
      roles = roles.slice(0, 10);
      return ok(undefined, 204);
    });
    const user = userEvent.setup();
    setup();
    await screen.findByText("11 roles");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getAllByRole("button", { name: "Role 10" })[0]!);
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText("10 roles")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole("button", { name: "Role 0" }).length,
    ).toBeGreaterThan(0);
  });

  it("hides actions for scoped/read-only grants and preserves drafts when edit access is revoked", async () => {
    const user = userEvent.setup();
    const { rerender, client } = setup();
    await screen.findByText("1 role");
    await user.click(screen.getAllByRole("button", { name: role.name })[0]!);
    const name = await screen.findByLabelText("Name");
    await user.type(name, " draft");
    const limited: CurrentAccess = {
      ...access,
      grants: [
        { permissionKey: "role.read", scope: "ORGANIZATION" },
        { permissionKey: "role.create", scope: "SELF" },
      ],
    };
    rerender(
      <QueryClientProvider client={client}>
        <RolesManager access={limited} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    expect(screen.getByLabelText("Name")).toHaveValue(`${role.name} draft`);
    expect(
      screen.queryByRole("button", { name: "New role" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete role" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: "Grant role.read at Organization scope",
      }),
    ).toBeDisabled();
  });

  it("shows a retryable denied response instead of stale list content", async () => {
    get.mockResolvedValue(denied());
    setup();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
    expect(screen.queryByText(role.name)).not.toBeInTheDocument();
  });
  it("refreshes untouched fields and preserves only edited fields", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await screen.findByText("1 role");
    await user.click(screen.getAllByRole("button", { name: role.name })[0]!);
    const description = await screen.findByLabelText("Description");
    await user.type(description, " draft");
    detail = { ...detail, name: "Renamed by another administrator" };
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["rbac"] });
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue(detail.name),
    );
    expect(description).toHaveValue("Regional work draft");
    patch.mockImplementation(
      async (
        _path: string,
        options: { body: { name: string; description: string } },
      ) => {
        detail = { ...detail, ...options.body };
        return ok(detail);
      },
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/roles/{id}",
      expect.objectContaining({
        body: { name: detail.name, description: "Regional work draft" },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
  });
});
