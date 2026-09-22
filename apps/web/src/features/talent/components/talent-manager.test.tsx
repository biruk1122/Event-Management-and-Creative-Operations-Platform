import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { makeTalent } from "../test-data";
import { TalentManager } from "./talent-manager";
import type { Talent } from "../lib/talent-types";

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

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["talent.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

const AMINA = makeTalent({
  id: "tal-1",
  fullName: "Amina Tesfaye",
  type: "MUSICIAN",
});
const BEZA = makeTalent({
  id: "tal-2",
  fullName: "Beza Alemu",
  type: "ARTIST",
  availability: "UNAVAILABLE",
});

let listItems: Talent[];
let listTotal: number;
let listFails: number;

interface RequestOptions {
  params?: { query?: Record<string, unknown>; path?: { id?: string } };
}

function lastListQuery(): Record<string, unknown> {
  const calls = get.mock.calls.filter(([path]) => path === "/api/v1/talents");
  return calls[calls.length - 1]![1].params.query;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  put.mockReset();
  del.mockReset();
  listItems = [AMINA, BEZA];
  listTotal = 2;
  listFails = 0;

  get.mockImplementation(async (path: string, options?: RequestOptions) => {
    switch (path) {
      case "/api/v1/talents":
        if (listFails > 0) {
          listFails -= 1;
          return { data: undefined, response: { ok: false, status: 500 } };
        }
        return ok({
          items: listItems,
          page: (options?.params?.query?.page as number) ?? 1,
          pageSize: 10,
          total: listTotal,
        });
      case "/api/v1/talents/{id}":
        return ok(
          listItems.find((item) => item.id === options?.params?.path?.id) ??
            null,
        );
      case "/api/v1/users":
        return ok({
          items: [
            {
              id: "u1",
              email: "m@x.co",
              firstName: "Morgan",
              lastName: "Lead",
            },
          ],
        });
      case "/api/v1/events":
        return ok({ items: [{ id: "e1", name: "Aurora Premiere" }] });
      default:
        return { data: undefined, response: { ok: false, status: 404 } };
    }
  });
});

function renderManager(
  current: CurrentAccess = access("talent.create", "talent.update"),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <TalentManager access={current} />
    </QueryClientProvider>,
  );
  return { client, invalidate };
}

describe("TalentManager list", () => {
  it("announces loading, then shows the count and the talent the API returned", async () => {
    renderManager();

    expect(screen.getByText("Loading talent…")).toBeVisible();
    expect(await screen.findByText("2 talents")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Amina Tesfaye" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Beza Alemu" }).length,
    ).toBeGreaterThan(0);
  });

  it("requests the first page with the page size and no filters", async () => {
    renderManager();
    await screen.findByText("2 talents");

    expect(lastListQuery()).toEqual({ page: 1, pageSize: 10 });
  });

  it("shows a recoverable error and reloads on retry", async () => {
    const user = userEvent.setup();
    listFails = 1;
    renderManager();

    expect(
      await screen.findByText("We could not load the data. Try again."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 talents")).toBeVisible();
  });

  it("explains an empty list", async () => {
    listItems = [];
    listTotal = 0;
    renderManager();

    expect(await screen.findByText("0 talents")).toBeVisible();
    expect(screen.getByText("No talent profiles yet")).toBeVisible();
  });

  it("re-checks access when the API answers 401 or 403", async () => {
    listFails = 1;
    get.mockImplementationOnce(async () => ({
      data: undefined,
      response: { ok: false, status: 403 },
    }));
    const { invalidate } = renderManager();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: accessKey }),
    );
  });
});

describe("TalentManager filters", () => {
  it("asks the API for the chosen type and availability", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("2 talents");

    await user.click(screen.getByRole("combobox", { name: "Filter by type" }));
    await user.click(await screen.findByRole("option", { name: "Artist" }));
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ type: "ARTIST", page: 1 }),
    );

    await user.click(
      screen.getByRole("combobox", { name: "Filter by availability" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Unavailable" }),
    );
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({
        type: "ARTIST",
        availability: "UNAVAILABLE",
      }),
    );
  });

  it("debounces the name search and sends the trimmed term", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("2 talents");

    await user.type(screen.getByLabelText("Search"), "  amina ");

    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ search: "amina" }),
    );
    expect(screen.getByText(/matching talent/)).toBeVisible();
  });
});

describe("TalentManager permissions", () => {
  it("hides the create action for a read-only caller", async () => {
    renderManager(access());
    await screen.findByText("2 talents");

    expect(
      screen.queryByRole("button", { name: "New talent" }),
    ).not.toBeInTheDocument();
    const paths = get.mock.calls.map(([path]) => path);
    expect(paths).not.toContain("/api/v1/users");
    expect(paths).not.toContain("/api/v1/events");
  });

  it("loads assignable events only when the caller can assign", async () => {
    renderManager(access("talent.assign"));
    await screen.findByText("2 talents");

    await waitFor(() => {
      const paths = get.mock.calls.map(([path]) => path);
      expect(paths).toContain("/api/v1/events");
    });
  });

  it("shows the create action to a caller who may create", async () => {
    renderManager(access("talent.create"));
    await screen.findByText("2 talents");

    expect(screen.getByRole("button", { name: "New talent" })).toBeVisible();
  });
});

describe("TalentManager create", () => {
  it("creates a talent and announces success", async () => {
    const user = userEvent.setup();
    post.mockImplementation(async () =>
      ok(makeTalent({ id: "tal-3", fullName: "Chala Girma" }), 201),
    );
    renderManager();
    await screen.findByText("2 talents");

    await user.click(screen.getByRole("button", { name: "New talent" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full name"), "Chala Girma");
    await user.click(
      within(dialog).getByRole("button", { name: "Create talent" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/talents",
        expect.objectContaining({
          body: expect.objectContaining({ fullName: "Chala Girma" }),
        }),
      ),
    );
    expect(await screen.findByText("Talent created.")).toBeInTheDocument();
  });
});
