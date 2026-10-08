import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationShell } from "./application-shell";

const mocks = vi.hoisted(() => ({
  pathname: "/tasks",
  replace: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  refetch: vi.fn(),
  fetching: false,
  error: false,
  userId: "user-1",
  pendingLogout: false,
  grants: [
    { permissionKey: "task.read", scope: "SELF" },
    { permissionKey: "notification.read", scope: "SELF" },
  ],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: () => ({
    data: { userId: mocks.userId, grants: mocks.grants },
    isFetching: mocks.fetching,
    isError: mocks.error,
    isPaused: false,
    isPending: false,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/features/auth/api/auth-queries", () => ({
  useCurrentUser: () => ({
    data: { id: "user-1", email: "user@example.com" },
    isError: false,
    isPending: false,
    refetch: mocks.refetch,
  }),
  useLogoutMutation: () => ({
    mutateAsync: mocks.logout,
    isPending: mocks.pendingLogout,
  }),
}));
vi.mock("@/features/notifications/components/notifications-navigation", () => ({
  NotificationsBell: () => <button>Open notifications</button>,
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.pathname = "/tasks";
  mocks.fetching = false;
  mocks.error = false;
  mocks.pendingLogout = false;
  mocks.userId = "user-1";
  mocks.logout.mockResolvedValue(undefined);
});
const content = (
  <main>
    <h1>Tasks</h1>
    <p>Existing content</p>
  </main>
);
describe("application shell", () => {
  it("leaves login outside the shell", () => {
    mocks.pathname = "/login";
    render(<ApplicationShell>{content}</ApplicationShell>);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("mounts one sidebar, one header and the unchanged content", () => {
    render(<ApplicationShell>{content}</ApplicationShell>);
    const nav = screen.getByRole("navigation", {
      name: "Primary",
    });
    expect(within(nav).getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).queryByRole("link", { name: "Users" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Open notifications" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#shell-content");
  });
  it.each(["fetching", "error", "pendingLogout"] as const)(
    "hides cached destinations while %s",
    (flag) => {
      mocks[flag] = true;
      render(<ApplicationShell>{content}</ApplicationShell>);
      expect(
        within(screen.getByRole("navigation", { name: "Primary" })).queryByRole(
          "link",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Open notifications" }),
      ).not.toBeInTheDocument();
    },
  );
  it("rejects an access cache belonging to a different account", () => {
    mocks.userId = "previous-user";
    render(<ApplicationShell>{content}</ApplicationShell>);
    expect(
      screen.queryByRole("link", { name: "Tasks" }),
    ).not.toBeInTheDocument();
  });
  it("restores drawer trigger focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell>{content}</ApplicationShell>);
    const trigger = screen.getAllByRole("button", {
      name: "Open navigation",
    })[0]!;
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("persists a collapse choice only for the current account", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell>{content}</ApplicationShell>);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("lela:sidebar:user-1")).toBe("collapsed");
    expect(localStorage.getItem("lela:sidebar:previous-user")).toBeNull();
  });
  it("moves focus and announces a completed route change", async () => {
    const view = render(<ApplicationShell>{content}</ApplicationShell>);
    mocks.pathname = "/todos";
    view.rerender(
      <ApplicationShell>
        <main>
          <h1>To-Do</h1>
        </main>
      </ApplicationShell>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "To-Do" })).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("To-Do page");
  });
  it("waits for a streamed loading heading to be replaced before focusing", async () => {
    const view = render(<ApplicationShell>{content}</ApplicationShell>);
    mocks.pathname = "/dashboard";
    view.rerender(
      <ApplicationShell>
        <main aria-busy="true">
          <h1>Loading dashboard</h1>
        </main>
      </ApplicationShell>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      screen.getByRole("heading", { name: "Loading dashboard" }),
    ).not.toHaveFocus();
    view.rerender(
      <ApplicationShell>
        <main>
          <h1>Dashboard ready</h1>
        </main>
      </ApplicationShell>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Dashboard ready" }),
      ).toHaveFocus(),
    );
  });
  it("signs out through the existing mutation and replaces the route", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell>{content}</ApplicationShell>);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });
  it("reports sign-out failure without claiming success", async () => {
    mocks.logout.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<ApplicationShell>{content}</ApplicationShell>);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not be confirmed",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
