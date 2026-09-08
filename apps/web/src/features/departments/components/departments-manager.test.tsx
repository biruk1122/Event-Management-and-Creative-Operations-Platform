import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepartmentsManager } from "./departments-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type {
  Department,
  PaginatedDepartments,
} from "../lib/departments-types";

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: vi.fn(), PUT: put, DELETE: del },
}));

const now = "2026-09-01T09:00:00.000Z";

function makeDepartment(
  overrides: Partial<Department> & Pick<Department, "id" | "name">,
): Department {
  return {
    description: null,
    manager: null,
    employeeCount: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["department.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  };
}

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number) => ({
  error: { code, status },
  response: { ok: false, status },
});

let page1: Department[];
let page2: Department[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? page2 : page1;
  return ok({
    items,
    page: requestedPage,
    pageSize: 10,
    total,
  } as PaginatedDepartments);
}

beforeEach(() => {
  vi.resetAllMocks();
  page1 = [
    makeDepartment({ id: "d1", name: "Event Management", employeeCount: 4 }),
    makeDepartment({ id: "d2", name: "Production", employeeCount: 2 }),
  ];
  page2 = [];
  total = 2;
  get.mockImplementation(
    async (
      path: string,
      opts?: {
        params?: { query?: Record<string, unknown>; path?: { id?: string } };
      },
    ) => {
      if (path === "/api/v1/departments")
        return listResponse(opts?.params?.query);
      if (path === "/api/v1/users")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/departments/{id}") {
        const id = opts?.params?.path?.id;
        return ok([...page1, ...page2].find((d) => d.id === id) ?? null);
      }
      return ok(null);
    },
  );
});

function setup(
  currentAccess = access("department.create", "department.update"),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DepartmentsManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("DepartmentsManager API integration", () => {
  it("renders the authoritative list and count from the API", async () => {
    setup();
    expect(await screen.findByText("2 departments")).toBeVisible();
    expect(screen.getAllByText("Event Management")[0]).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/departments",
      expect.objectContaining({
        params: { query: expect.objectContaining({ page: 1, pageSize: 10 }) },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    page2 = [makeDepartment({ id: "d11", name: "Creative Department" })];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/departments",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
    expect(
      (await screen.findAllByText("Creative Department"))[0],
    ).toBeVisible();
  });

  it("passes the debounced search term to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 departments");

    await user.type(screen.getByLabelText("Search"), "prod");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/departments",
        expect.objectContaining({
          params: { query: expect.objectContaining({ search: "prod" }) },
        }),
      ),
    );
  });

  it("passes the status filter to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 departments");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/departments",
        expect.objectContaining({
          params: { query: expect.objectContaining({ status: "INACTIVE" }) },
        }),
      ),
    );
  });

  it("hides the create action without department.create", async () => {
    setup(access("department.update"));
    await screen.findByText("2 departments");
    expect(
      screen.queryByRole("button", { name: "New department" }),
    ).not.toBeInTheDocument();
  });

  it("hides the detail-dialog write controls for a read-only caller", async () => {
    const user = userEvent.setup();
    setup(access());
    await screen.findByText("2 departments");

    await user.click(
      screen.getAllByRole("button", { name: "Event Management" })[0]!,
    );
    await screen.findByRole("heading", { name: "Event Management" });

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate department" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete department" }),
    ).not.toBeInTheDocument();
  });

  it("creates a department and refetches the list", async () => {
    const created = makeDepartment({ id: "d3", name: "New Unit" });
    post.mockResolvedValue(ok(created, 201));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 departments");

    page1 = [...page1, created];
    total = 3;

    await user.click(screen.getByRole("button", { name: "New department" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New Unit");
    await user.click(
      within(dialog).getByRole("button", { name: "Create department" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/departments",
        expect.objectContaining({
          body: expect.objectContaining({ name: "New Unit" }),
        }),
      ),
    );
    expect(await screen.findByText("3 departments")).toBeVisible();
  });

  it("surfaces a name conflict and keeps the dialog open", async () => {
    post.mockResolvedValue(fail("DEPARTMENT_NAME_CONFLICT", 409));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 departments");

    await user.click(screen.getByRole("button", { name: "New department" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Event Management");
    await user.click(
      within(dialog).getByRole("button", { name: "Create department" }),
    );

    expect(
      await screen.findByText("A department with that name already exists."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Name")).toHaveValue(
      "Event Management",
    );
  });

  it("removes a department from the list after a delete", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    setup(access("department.delete"));
    await screen.findByText("2 departments");

    await user.click(screen.getAllByRole("button", { name: "Production" })[0]!);
    await screen.findByRole("heading", { name: "Production" });
    page1 = page1.filter((d) => d.id !== "d2");
    total = 1;

    await user.click(screen.getByRole("button", { name: "Delete department" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/departments/{id}",
        expect.objectContaining({ params: { path: { id: "d2" } } }),
      ),
    );
    expect(await screen.findByText("1 department")).toBeVisible();
  });

  it("shows an actionable error when the list request is denied", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/departments")
        return { data: undefined, response: { ok: false, status: 403 } };
      return ok({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have access to this area.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
