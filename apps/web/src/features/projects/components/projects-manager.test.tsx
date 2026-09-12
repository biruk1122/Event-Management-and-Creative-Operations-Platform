import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsManager } from "./projects-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { Project } from "../lib/projects-types";

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

function makeProject(
  overrides: Partial<Project> & Pick<Project, "id" | "name">,
): Project {
  return {
    workspaceId: `ws-${overrides.id}`,
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["project.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

let page1: Project[];
let page2: Project[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? page2 : page1;
  return ok({ items, page: requestedPage, pageSize: 10, total });
}

beforeEach(() => {
  vi.resetAllMocks();
  page1 = [
    makeProject({ id: "p1", name: "Brand Refresh", status: "ACTIVE" }),
    makeProject({ id: "p2", name: "Venue Partnership" }),
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
      if (path === "/api/v1/projects") return listResponse(opts?.params?.query);
      if (path === "/api/v1/projects/{id}") {
        const id = opts?.params?.path?.id;
        return ok([...page1, ...page2].find((p) => p.id === id) ?? null);
      }
      if (path === "/api/v1/users")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/teams")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/events")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      return ok(null);
    },
  );
});

function setup(currentAccess = access("project.create", "project.update")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("ProjectsManager API integration", () => {
  it("fetches the first page from the server", async () => {
    setup();
    expect(await screen.findByText("2 projects")).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({
        params: {
          query: expect.objectContaining({ page: 1, pageSize: 10 }),
        },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    page2 = [makeProject({ id: "p11", name: "Later Initiative" })];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/projects",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
  });

  it("pushes the status filter to the server", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 projects");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Planned" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/projects",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ status: "PLANNED", page: 1 }),
          },
        }),
      ),
    );
  });

  it("pushes the debounced name search to the server", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 projects");

    await user.type(screen.getByLabelText("Search"), "brand");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/projects",
        expect.objectContaining({
          params: { query: expect.objectContaining({ search: "brand" }) },
        }),
      ),
    );
  });

  it("creates a project and refetches", async () => {
    post.mockResolvedValue(
      ok(makeProject({ id: "p-new", name: "Harvest Retro" }), 201),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 projects");

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(
      within(await screen.findByRole("dialog")).getByLabelText("Name"),
      "Harvest Retro",
    );
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/projects",
        expect.objectContaining({
          body: expect.objectContaining({ name: "Harvest Retro" }),
        }),
      ),
    );
  });

  it("hides the create action without the create grant", async () => {
    setup(access());
    await screen.findByText("2 projects");
    expect(
      screen.queryByRole("button", { name: "New project" }),
    ).not.toBeInTheDocument();
  });

  it("shows a recoverable error state when the list request fails", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/projects")
        return { data: undefined, response: { status: 500 } };
      return ok({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    setup();
    expect(
      await screen.findByText("We could not load the data. Try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("opens a row and deletes it via the API", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    setup(access("project.delete"));
    await screen.findByText("2 projects");

    await user.click(
      screen.getAllByRole("button", { name: "Brand Refresh" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Brand Refresh" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete project" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/projects/{id}",
        expect.objectContaining({ params: { path: { id: "p1" } } }),
      ),
    );
  });
});
