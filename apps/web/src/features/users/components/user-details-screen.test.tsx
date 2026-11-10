import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { UserDetailsScreen } from "./user-details-screen";
import type { User } from "../lib/users-types";

const { get, post, put, patch, state, push, replace } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  state: { access: null as unknown, edit: "" },
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PUT: put, PATCH: patch },
}));
vi.mock("@/features/auth/api/access-queries", () => ({
  accessKey: ["access"],
  useCurrentAccess: () => state.access,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(state.edit),
}));

const now = "2026-09-01T09:00:00.000Z";

function ada(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+251 911 000 111",
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: { id: "r1", name: "Department Manager" },
    department: { id: "d1", name: "Marketing" },
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "viewer",
    role: "SUPER_ADMIN",
    department: null,
    overseenDepartments: [],
    grants: permissions.map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as unknown as CurrentAccess;
}

const READ = [
  "user.read",
  "user.update",
  "user.deactivate",
  "user.manage_status",
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setup(
  options: {
    user?: User | null;
    permissions?: string[];
    employees?: unknown[];
    edit?: string;
  } = {},
) {
  state.access = {
    isPending: false,
    isError: false,
    data: access(...(options.permissions ?? READ)),
  };
  state.edit = options.edit ? `edit=${options.edit}` : "";
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/users/{id}") {
      return {
        data: options.user === undefined ? ada() : options.user,
        response: { status: 200 },
      };
    }
    if (path === "/api/v1/employees") {
      return {
        data: {
          items: options.employees ?? [],
          page: 1,
          pageSize: 10,
          total: (options.employees ?? []).length,
        },
        response: { status: 200 },
      };
    }
    if (path === "/api/v1/roles")
      return { data: [], response: { status: 200 } };
    if (path === "/api/v1/departments") {
      return {
        data: { items: [], page: 1, pageSize: 100, total: 0 },
        response: { status: 200 },
      };
    }
    return { data: undefined, response: { status: 404 } };
  });
  return render(<UserDetailsScreen userId="u1" />, { wrapper });
}

describe("UserDetailsScreen", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    push.mockReset();
    replace.mockReset();
  });

  it("shows the profile, access, account and employee sections", async () => {
    setup({
      employees: [
        {
          id: "e1",
          userId: "u1",
          employeeCode: "EMP-042",
          position: "Campaign Lead",
          departmentName: "Marketing",
          employmentType: "FULL_TIME",
          employmentStatus: "ACTIVE",
          employmentDate: "2024-01-15",
          workLocation: "Addis HQ",
        },
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("+251 911 000 111")).toBeInTheDocument();
    const access = screen.getByRole("region", { name: "Access" });
    expect(within(access).getByText("Department Manager")).toBeInTheDocument();
    expect(within(access).getByText("Marketing")).toBeInTheDocument();
    const employee = await screen.findByText("EMP-042");
    expect(employee).toBeInTheDocument();
    expect(screen.getByText("Campaign Lead")).toBeInTheDocument();
  });

  it("says when no employee record is linked", async () => {
    setup({ employees: [] });
    expect(
      await screen.findByText(
        "No employee record is linked to this account yet.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the existing editor from the Edit user action", async () => {
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit user" }),
    );
    expect(await screen.findByLabelText("First name")).toHaveValue("Ada");
  });

  it("opens the editor directly when the page is opened with ?edit=1", async () => {
    setup({ edit: "1" });
    expect(await screen.findByLabelText("First name")).toHaveValue("Ada");
  });

  it("asks for confirmation before deactivating, then updates the status", async () => {
    post.mockResolvedValue({
      data: ada({ status: "INACTIVE", deactivatedAt: now }),
      response: { status: 200 },
    });
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Deactivate" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Deactivate Ada Lovelace?" }),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/users/{id}/deactivate",
        expect.objectContaining({ params: { path: { id: "u1" } } }),
      ),
    );
    expect((await screen.findAllByText("Inactive")).length).toBeGreaterThan(0);
  });

  it("hides the status change for a viewer without the permission", async () => {
    setup({ permissions: ["user.read"] });
    await screen.findByRole("heading", { level: 1, name: "Ada Lovelace" });
    expect(
      screen.queryByRole("button", { name: "Deactivate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit user" }),
    ).not.toBeInTheDocument();
  });

  it("reports a user that cannot be loaded", async () => {
    setup({ user: null });
    expect(
      await screen.findByText(
        "This user could not be loaded. They may no longer exist.",
      ),
    ).toBeInTheDocument();
  });
});
