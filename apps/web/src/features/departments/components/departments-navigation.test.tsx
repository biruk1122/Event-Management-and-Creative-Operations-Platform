import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { DepartmentsNavigation } from "./departments-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let access: CurrentAccess | null;
let status = 200;

beforeEach(() => {
  access = {
    userId: "a1",
    grants: [{ permissionKey: "department.read", scope: "ORGANIZATION" }],
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
      <DepartmentsNavigation />
    </QueryClientProvider>,
  );
}

describe("DepartmentsNavigation", () => {
  it("links to /departments when the caller can read departments", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: "Departments" }),
    ).toHaveAttribute("href", "/departments");
  });

  it("also links for a department-scoped reader", async () => {
    access = {
      userId: "a1",
      grants: [{ permissionKey: "department.read", scope: "DEPARTMENT" }],
    };
    setup();
    expect(
      await screen.findByRole("link", { name: "Departments" }),
    ).toBeInTheDocument();
  });

  it("renders nothing without the department.read grant", async () => {
    access = { userId: "a1", grants: [] };
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Departments" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active session", async () => {
    access = null;
    status = 401;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Departments" }),
    ).not.toBeInTheDocument();
  });
});
