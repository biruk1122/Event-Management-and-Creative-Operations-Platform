import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersManager } from "./users-manager";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { PaginatedUsers, User } from "../lib/users-types";

const { get, post, patch, put } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put },
}));

const now = "2026-09-01T09:00:00.000Z";

function makeUser(overrides: Partial<User> & Pick<User, "id" | "email">): User {
  return {
    firstName: "Test",
    lastName: "Person",
    phone: null,
    profileImage: null,
    status: "ACTIVE",
    deactivatedAt: null,
    role: null,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["user.read", ...permissions].map((permissionKey) => ({
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

let page1: User[];
let page2: User[];
let total: number;

function listResponse(query: Record<string, unknown> | undefined) {
  const requestedPage = Number(query?.page ?? 1);
  const items = requestedPage === 2 ? page2 : page1;
  return ok({
    items,
    page: requestedPage,
    pageSize: 10,
    total,
  } as PaginatedUsers);
}

beforeEach(() => {
  vi.resetAllMocks();
  page1 = [
    makeUser({
      id: "u1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    }),
    makeUser({
      id: "u2",
      email: "grace@example.com",
      firstName: "Grace",
      lastName: "Hopper",
    }),
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
      if (path === "/api/v1/users") return listResponse(opts?.params?.query);
      if (path === "/api/v1/roles")
        return ok([{ id: "role-1", name: "Team Member" }]);
      if (path === "/api/v1/users/{id}") {
        const id = opts?.params?.path?.id;
        return ok([...page1, ...page2].find((u) => u.id === id) ?? null);
      }
      return ok(null);
    },
  );
});

function setup(currentAccess = access("user.create", "user.update")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UsersManager access={currentAccess} />
    </QueryClientProvider>,
  );
}

describe("UsersManager API integration", () => {
  it("renders the authoritative list and count from the API", async () => {
    setup();
    expect(await screen.findByText("2 users")).toBeVisible();
    expect(screen.getAllByText("Ada Lovelace")[0]).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/users",
      expect.objectContaining({
        params: { query: expect.objectContaining({ page: 1, pageSize: 10 }) },
      }),
    );
  });

  it("requests the next page from the server", async () => {
    total = 15;
    page2 = [
      makeUser({
        id: "u11",
        email: "kat@example.com",
        firstName: "Kat",
        lastName: "Ng",
      }),
    ];
    const user = userEvent.setup();
    setup();

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/users",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
    expect((await screen.findAllByText("Kat Ng"))[0]).toBeVisible();
  });

  it("passes the debounced search term to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 users");

    await user.type(screen.getByLabelText("Search"), "grace");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/users",
        expect.objectContaining({
          params: { query: expect.objectContaining({ search: "grace" }) },
        }),
      ),
    );
  });

  it("passes the status filter to the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 users");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/users",
        expect.objectContaining({
          params: { query: expect.objectContaining({ status: "INACTIVE" }) },
        }),
      ),
    );
  });

  it("hides the create action without user.create", async () => {
    setup(access("user.update"));
    await screen.findByText("2 users");
    expect(
      screen.queryByRole("button", { name: "New user" }),
    ).not.toBeInTheDocument();
  });

  it("creates a user and refetches the list", async () => {
    const created = makeUser({
      id: "u3",
      email: "new@example.com",
      firstName: "New",
      lastName: "Hire",
    });
    post.mockResolvedValue(ok(created, 201));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 users");

    // The refetched list now includes the new user.
    page1 = [...page1, created];
    total = 3;

    await user.click(screen.getByRole("button", { name: "New user" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("First name"), "New");
    await user.type(within(dialog).getByLabelText("Last name"), "Hire");
    await user.type(within(dialog).getByLabelText("Email"), "new@example.com");
    await user.type(
      within(dialog).getByLabelText("Temporary password"),
      "temp-password-1",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create user" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/users",
        expect.objectContaining({
          body: expect.objectContaining({ email: "new@example.com" }),
        }),
      ),
    );
    expect(await screen.findByText("3 users")).toBeVisible();
  });

  it("surfaces an email conflict and keeps the dialog open", async () => {
    post.mockResolvedValue(fail("USER_EMAIL_CONFLICT", 409));
    const user = userEvent.setup();
    setup();
    await screen.findByText("2 users");

    await user.click(screen.getByRole("button", { name: "New user" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("First name"), "Dup");
    await user.type(within(dialog).getByLabelText("Last name"), "Licate");
    await user.type(within(dialog).getByLabelText("Email"), "ada@example.com");
    await user.type(
      within(dialog).getByLabelText("Temporary password"),
      "temp-password-1",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create user" }),
    );

    expect(
      await screen.findByText("A user with that email already exists."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Email")).toHaveValue(
      "ada@example.com",
    );
  });

  it("shows an actionable error when the list request is denied", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/users")
        return { data: undefined, response: { ok: false, status: 403 } };
      return ok([]);
    });
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have access to this area.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
