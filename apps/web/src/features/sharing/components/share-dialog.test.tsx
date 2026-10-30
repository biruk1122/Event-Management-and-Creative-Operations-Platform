import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShareDialog } from "./share-dialog";

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: post,
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: del,
  },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token" }));

const existingShare = {
  id: "share-1",
  letterId: "letter-1",
  documentId: null,
  recipientId: "user-2",
  recipientName: "Jordan Lee",
  allEmployees: false,
  scope: "VIEW" as const,
  sharedById: "user-1",
  sharedByName: "HR Manager",
  createdAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  revokedById: null,
  revokedByName: null,
};

const candidate = {
  id: "user-3",
  name: "Morgan Lead",
  email: "morgan@example.com",
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/letters/{letterId}/shares") {
      return { data: [existingShare], response: { ok: true, status: 200 } };
    }
    if (path === "/api/v1/sharing/recipients") {
      return { data: [candidate], response: { ok: true, status: 200 } };
    }
    return { data: [], response: { ok: true, status: 200 } };
  });
  post.mockResolvedValue({
    data: { ...existingShare, id: "share-2" },
    error: undefined,
    response: { ok: true, status: 201 },
  });
  del.mockResolvedValue({
    error: undefined,
    response: { ok: true, status: 204 },
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ShareDialog
        open
        onOpenChange={() => undefined}
        parentKind="letter"
        parentId="letter-1"
        parentLabel="LELA-CAST-2026-001"
      />
    </QueryClientProvider>,
  );
}

describe("ShareDialog", () => {
  it("allows retrying an employee lookup failure", async () => {
    const implementation = get.getMockImplementation()!;
    let fail = true;
    get.mockImplementation(async (path: string) =>
      path === "/api/v1/sharing/recipients" && fail
        ? { response: { status: 500 } }
        : implementation(path),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Select employee" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load employees.",
    );
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    ).toBeVisible();
  });
  it("keeps employees hidden until the dropdown is opened and supports keyboard selection", async () => {
    setup();
    await screen.findByText("Jordan Lee");
    expect(screen.queryByLabelText("Find an employee")).not.toBeInTheDocument();
    expect(
      get.mock.calls.some(([path]) => path === "/api/v1/sharing/recipients"),
    ).toBe(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Select employee" }));
    await screen.findByRole("button", { name: /Morgan Lead/ });
    expect(screen.getByLabelText("Find an employee")).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(
      screen.getByRole("button", { name: "Employee: Morgan Lead" }),
    ).toHaveFocus();
    expect(screen.queryByLabelText("Find an employee")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Employee: Morgan Lead" }),
    );
    expect(
      within(
        await screen.findByRole("list", { name: "Matching employees" }),
      ).getByRole("button", { name: /Morgan Lead/ }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: /Share/ })).toBeVisible();
  });
  it("lists who the record is currently shared with", async () => {
    setup();

    expect(await screen.findByText("Jordan Lee")).toBeVisible();
    expect(screen.getByText(/shared by HR Manager/)).toBeVisible();
  });

  it("shares with a searched employee", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("Jordan Lee");

    await user.click(screen.getByRole("button", { name: "Select employee" }));
    await user.type(screen.getByLabelText("Find an employee"), "morgan");
    const match = await screen.findByRole("button", { name: /Morgan Lead/ });
    await user.click(match);
    expect(screen.queryByLabelText("Find an employee")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/letters/{letterId}/shares",
        expect.objectContaining({
          body: expect.objectContaining({
            recipientId: "user-3",
            allEmployees: false,
            scope: "VIEW",
          }),
        }),
      ),
    );
  });

  it("shares with all employees", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("Jordan Lee");

    await user.click(screen.getByRole("tab", { name: "All employees" }));
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/letters/{letterId}/shares",
        expect.objectContaining({
          body: expect.objectContaining({ allEmployees: true }),
        }),
      ),
    );
  });

  it("revokes an existing share", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("Jordan Lee");

    await user.click(screen.getByRole("button", { name: /Revoke/ }));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/shares/{id}",
        expect.objectContaining({
          params: { path: { id: "share-1" } },
        }),
      ),
    );
  });
});
