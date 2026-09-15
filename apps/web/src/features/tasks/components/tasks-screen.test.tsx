import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { TasksScreen } from "./tasks-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get },
}));

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = {
    userId: "account-1",
    grants: [{ permissionKey: "task.read", scope: "WORKSPACE" }],
  } as CurrentAccess;
  get.mockImplementation(async () => ({
    data: currentAccess,
    response: { status: currentAccess ? 200 : 401 },
  }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TasksScreen />
    </QueryClientProvider>,
  );
}

describe("TasksScreen", () => {
  it("renders the task UI for any valid task.read scope", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeVisible();
  });

  it("denies a caller without task.read", async () => {
    currentAccess = { userId: "account-1", grants: [] } as CurrentAccess;
    setup();
    expect(
      await screen.findByText("You do not have access to tasks."),
    ).toBeVisible();
  });

  it("offers the safe session-expired recovery path", async () => {
    currentAccess = null;
    setup();
    expect(await screen.findByText(/Your session expired/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in in another tab" }),
    ).toHaveAttribute("href", "/login?next=%2Ftasks");
  });
});
