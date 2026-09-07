import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { RolesScreen } from "./roles-screen";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
const originalAccess: CurrentAccess = {
  userId: "account-1",
  grants: [
    { permissionKey: "role.read", scope: "ORGANIZATION" },
    { permissionKey: "role.create", scope: "ORGANIZATION" },
  ],
};
let currentAccess: CurrentAccess | null;
beforeEach(() => {
  currentAccess = originalAccess;
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions")
      return {
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      };
    return { data: [], response: { status: 200 } };
  });
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RolesScreen />
    </QueryClientProvider>,
  );
  return client;
}

describe("roles session boundary", () => {
  it("keeps drafts through session expiry and restores them only for the same account", async () => {
    const user = userEvent.setup();
    const client = setup();
    await user.click(await screen.findByRole("button", { name: "New role" }));
    await user.type(screen.getByLabelText("Name"), "My unsaved role");
    await user.type(screen.getByLabelText("Description"), "My description");
    currentAccess = null;
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(
      await screen.findByText(
        "Your session expired. Your unsaved input is kept in this tab.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ["rbac"] })).toHaveLength(
      0,
    );
    currentAccess = originalAccess;
    await user.click(screen.getByRole("button", { name: "I have signed in" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("My unsaved role");
    expect(screen.getByLabelText("Description")).toHaveValue("My description");
    currentAccess = { ...originalAccess, userId: "different-account" };
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "New role" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("removes loaded data immediately when role.read is revoked", async () => {
    const client = setup();
    await screen.findByText("0 roles");
    currentAccess = { ...originalAccess, grants: [] };
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Search roles")).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ["rbac"] })).toHaveLength(
      0,
    );
  });
});
