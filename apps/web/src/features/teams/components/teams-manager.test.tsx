import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamsManager } from "./teams-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { PaginatedTeams, Team } from "../lib/teams-types";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const now = "2026-09-01T09:00:00.000Z";

function makeTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    description: null,
    department: { id: "dep-1", name: "Production" },
    manager: null,
    members: [],
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["team.read", ...permissions].map((permissionKey) => ({
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

let page1: Team[];
let page2: Team[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? page2 : page1;
  return ok({
    items,
    page: requestedPage,
    pageSize: 10,
    total,
  } as PaginatedTeams);
}

beforeEach(() => {
  vi.resetAllMocks();
  page1 = [
    makeTeam({ id: "t1", name: "Production Team" }),
    makeTeam({ id: "t2", name: "Event Team" }),
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
      if (path === "/api/v1/teams") return listResponse(opts?.params?.query);
      if (path === "/api/v1/users")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/departments")
        return ok({
          items: [{ id: "dep-1", name: "Production" }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      if (path === "/api/v1/teams/{id}") {
        const id = opts?.params?.path?.id;
        return ok([...page1, ...page2].find((team) => team.id === id) ?? null);
      }
      return ok(null);
    },
  );
});

function setup(currentAccess = access("team.create", "team.update")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TeamsManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("TeamsManager API integration", () => {
  it("renders the authoritative list and count from the API", async () => {
    setup();
    expect(await screen.findByText("2 teams")).toBeVisible();
    expect(screen.getAllByText("Production Team")[0]).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/teams",
      expect.objectContaining({
        params: { query: expect.objectContaining({ page: 1, pageSize: 10 }) },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    page2 = [makeTeam({ id: "t11", name: "Creative Team" })];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/teams",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
    expect((await screen.findAllByText("Creative Team"))[0]).toBeVisible();
  });

  it("passes the debounced search term to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 teams");

    await user.type(screen.getByLabelText("Search"), "prod");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/teams",
        expect.objectContaining({
          params: { query: expect.objectContaining({ search: "prod" }) },
        }),
      ),
    );
  });

  it("passes the status filter to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 teams");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/teams",
        expect.objectContaining({
          params: { query: expect.objectContaining({ status: "INACTIVE" }) },
        }),
      ),
    );
  });

  it("passes the department filter to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 teams");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by department" }),
    );
    await user.click(await screen.findByRole("option", { name: "Production" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/teams",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ departmentId: "dep-1" }),
          },
        }),
      ),
    );
  });

  it("hides the create action without team.create", async () => {
    setup(access("team.update"));
    await screen.findByText("2 teams");
    expect(
      screen.queryByRole("button", { name: "New team" }),
    ).not.toBeInTheDocument();
  });

  it("hides the detail-dialog write controls for a read-only caller", async () => {
    const user = userEvent.setup();
    setup(access());
    await screen.findByText("2 teams");

    await user.click(
      screen.getAllByRole("button", { name: "Production Team" })[0]!,
    );
    await screen.findByRole("heading", { name: "Production Team" });

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate team" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete team" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Add member" }),
    ).not.toBeInTheDocument();
  });

  it("creates a team and refetches the list", async () => {
    const created = makeTeam({ id: "t3", name: "New Team" });
    post.mockResolvedValue(ok(created, 201));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 teams");

    page1 = [...page1, created];
    total = 3;

    await user.click(screen.getByRole("button", { name: "New team" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New Team");
    await user.click(
      within(dialog).getByRole("combobox", { name: "Department" }),
    );
    await user.click(await screen.findByRole("option", { name: "Production" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Create team" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/teams",
        expect.objectContaining({
          body: expect.objectContaining({
            name: "New Team",
            departmentId: "dep-1",
          }),
        }),
      ),
    );
    expect(await screen.findByText("3 teams")).toBeVisible();
  });

  it("surfaces a name conflict and keeps the dialog open", async () => {
    post.mockResolvedValue(fail("TEAM_NAME_CONFLICT", 409));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 teams");

    await user.click(screen.getByRole("button", { name: "New team" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Production Team");
    await user.click(
      within(dialog).getByRole("combobox", { name: "Department" }),
    );
    await user.click(await screen.findByRole("option", { name: "Production" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Create team" }),
    );

    expect(
      await screen.findByText(
        "That department already has a team with this name.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Name")).toHaveValue(
      "Production Team",
    );
  });

  it("adds a member from the detail dialog", async () => {
    put.mockResolvedValue(
      ok(
        makeTeam({
          id: "t1",
          name: "Production Team",
          members: [
            {
              id: "u9",
              email: "u9@x.com",
              firstName: "Uma",
              lastName: "Nine",
            },
          ],
        }),
      ),
    );
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams") return listResponse(undefined);
      if (path === "/api/v1/users")
        return ok({
          items: [
            {
              id: "u9",
              email: "u9@x.com",
              firstName: "Uma",
              lastName: "Nine",
              status: "ACTIVE",
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      if (path === "/api/v1/departments")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/teams/{id}")
        return ok(makeTeam({ id: "t1", name: "Production Team" }));
      return ok(null);
    });
    const user = userEvent.setup();
    setup(access("team.manage_members"));
    await screen.findByText("2 teams");

    await user.click(
      screen.getAllByRole("button", { name: "Production Team" })[0]!,
    );
    await screen.findByRole("heading", { name: "Production Team" });
    await user.click(screen.getByRole("combobox", { name: "Add member" }));
    await user.click(await screen.findByRole("option", { name: "Uma Nine" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/v1/teams/{id}/members/{userId}",
        expect.objectContaining({
          params: { path: { id: "t1", userId: "u9" } },
        }),
      ),
    );
  });

  it("removes a team from the list after a delete", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    setup(access("team.delete"));
    await screen.findByText("2 teams");

    await user.click(screen.getAllByRole("button", { name: "Event Team" })[0]!);
    await screen.findByRole("heading", { name: "Event Team" });
    page1 = page1.filter((team) => team.id !== "t2");
    total = 1;

    await user.click(screen.getByRole("button", { name: "Delete team" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/teams/{id}",
        expect.objectContaining({ params: { path: { id: "t2" } } }),
      ),
    );
    expect(await screen.findByText("1 team")).toBeVisible();
  });

  it("shows an actionable error when the list request is denied", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams")
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
