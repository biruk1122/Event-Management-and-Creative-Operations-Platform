import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { TodoNavigation } from "./todo-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let access: CurrentAccess | null;
let status = 200;

beforeEach(() => {
  access = {
    userId: "account-1",
    grants: [{ permissionKey: "todo.read", scope: "SELF" }],
  };
  status = 200;
  get.mockImplementation(async () => ({ data: access, response: { status } }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TodoNavigation />
    </QueryClientProvider>,
  );
}

describe("TodoNavigation", () => {
  it("links to /todos when the caller can read their to-dos", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "To-Do" })).toHaveAttribute(
      "href",
      "/todos",
    );
  });

  it("renders nothing without a todo read grant", async () => {
    access = { userId: "account-1", grants: [] };
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "To-Do" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active session", async () => {
    access = null;
    status = 401;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "To-Do" }),
    ).not.toBeInTheDocument();
  });
});
