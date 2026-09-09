import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspacesManager } from "./workspaces-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { Workspace } from "../lib/workspaces-types";

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

function makeWorkspace(
  overrides: Partial<Workspace> & Pick<Workspace, "id" | "kind">,
): Workspace {
  return {
    manager: null,
    teams: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["event.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

let eventsPage1: Workspace[];
let eventsPage2: Workspace[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? eventsPage2 : eventsPage1;
  return ok({ items, page: requestedPage, pageSize: 10, total });
}

beforeEach(() => {
  vi.resetAllMocks();
  eventsPage1 = [
    makeWorkspace({
      id: "ws-1",
      kind: "EVENT",
      manager: {
        id: "u1",
        email: "morgan@example.com",
        firstName: "Morgan",
        lastName: "Lead",
      },
    }),
    makeWorkspace({ id: "ws-2", kind: "EVENT" }),
  ];
  eventsPage2 = [];
  total = 2;
  get.mockImplementation(
    async (
      path: string,
      opts?: {
        params?: { query?: Record<string, unknown>; path?: { id?: string } };
      },
    ) => {
      if (path === "/api/v1/workspaces")
        return listResponse(opts?.params?.query);
      if (path === "/api/v1/workspaces/{id}") {
        const id = opts?.params?.path?.id;
        return ok(
          [...eventsPage1, ...eventsPage2].find((w) => w.id === id) ?? null,
        );
      }
      if (path === "/api/v1/users")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      if (path === "/api/v1/teams")
        return ok({ items: [], page: 1, pageSize: 100, total: 0 });
      return ok(null);
    },
  );
});

function setup(currentAccess = access("event.create", "event.assign_manager")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspacesManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("WorkspacesManager API integration", () => {
  it("fetches the first page for the caller's default kind", async () => {
    setup();
    expect(await screen.findByText("2 workspaces")).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/workspaces",
      expect.objectContaining({
        params: {
          query: expect.objectContaining({
            kind: "EVENT",
            page: 1,
            pageSize: 10,
          }),
        },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    eventsPage2 = [makeWorkspace({ id: "ws-11", kind: "EVENT" })];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/workspaces",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
  });

  it("refetches when the kind changes", async () => {
    const user = userEvent.setup();
    setup(access("project.read"));
    await screen.findByText("2 workspaces");

    await user.click(screen.getByRole("combobox", { name: "Workspace kind" }));
    await user.click(await screen.findByRole("option", { name: "Project" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/workspaces",
        expect.objectContaining({
          params: { query: expect.objectContaining({ kind: "PROJECT" }) },
        }),
      ),
    );
  });

  it("filters the current page by manager without a new request", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 workspaces");
    const callsBefore = get.mock.calls.length;

    await user.type(screen.getByLabelText("Search"), "morgan");

    await waitFor(() =>
      expect(screen.getByText("1 of 2 on this page match")).toBeVisible(),
    );
    expect(get.mock.calls.length).toBe(callsBefore);
  });

  it("creates a workspace of the current kind and refetches", async () => {
    post.mockResolvedValue(
      ok(makeWorkspace({ id: "ws-new", kind: "EVENT" }), 201),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 workspaces");

    await user.click(screen.getByRole("button", { name: "New workspace" }));
    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/workspaces",
        expect.objectContaining({ body: { kind: "EVENT" } }),
      ),
    );
  });

  it("falls back to a still-readable kind when a grant is revoked mid-session", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wide = {
      userId: "operator-1",
      grants: [
        { permissionKey: "event.read", scope: "ORGANIZATION" },
        { permissionKey: "project.read", scope: "ORGANIZATION" },
      ],
    } as CurrentAccess;
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <WorkspacesManager access={wide} />
      </QueryClientProvider>,
    );
    await screen.findByText("2 workspaces");

    // The caller loses event.read; PROJECT is still readable.
    rerender(
      <QueryClientProvider client={client}>
        <WorkspacesManager
          access={
            {
              userId: "operator-1",
              grants: [
                { permissionKey: "project.read", scope: "ORGANIZATION" },
              ],
            } as CurrentAccess
          }
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/workspaces",
        expect.objectContaining({
          params: { query: expect.objectContaining({ kind: "PROJECT" }) },
        }),
      ),
    );
  });

  it("hides the create action without the create key for the kind", async () => {
    setup(access("event.assign_manager"));
    await screen.findByText("2 workspaces");
    expect(
      screen.queryByRole("button", { name: "New workspace" }),
    ).not.toBeInTheDocument();
  });

  it("opens a row and deletes it via the API", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    const user = userEvent.setup();
    setup(access("event.delete"));
    await screen.findByText("2 workspaces");

    await user.click(
      screen.getAllByRole("button", {
        name: "Event workspace managed by Morgan Lead",
      })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Event workspace" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete workspace" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/workspaces/{id}",
        expect.objectContaining({ params: { path: { id: "ws-1" } } }),
      ),
    );
  });
});
