import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { LettersManager } from "./letters-manager";

const { get, replace } = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("direction=INCOMING"),
}));

const access: CurrentAccess = {
  userId: "admin-1",
  role: "SUPER_ADMIN",
  department: null,
  grants: [
    { permissionKey: "letter.read", scope: "ORGANIZATION" },
    { permissionKey: "letter.create", scope: "ORGANIZATION" },
  ],
};

function setup(currentAccess = access) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LettersManager access={currentAccess} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  get.mockImplementation(async (path: string) => ({
    data:
      path === "/api/v1/letters/options"
        ? {
            categories: ["MKT", "OTHER"],
            directions: ["INCOMING", "OUTGOING"],
            projects: [],
          }
        : { items: [], page: 1, pageSize: 20, total: 0 },
    response: { ok: true, status: 200 },
  }));
});

describe("LettersManager presentation controls", () => {
  it("supports arrow-key direction navigation and preserves the route parameter", async () => {
    const user = setup();
    await screen.findByText("0 letters");
    const incoming = screen.getByRole("tab", { name: "Incoming" });
    const outgoing = screen.getByRole("tab", { name: "Outgoing" });
    incoming.focus();
    await user.keyboard("{ArrowRight}");
    expect(replace).toHaveBeenCalledWith("?direction=OUTGOING", {
      scroll: false,
    });
    expect(outgoing).toHaveFocus();
    await user.keyboard("{Home}");
    expect(replace).toHaveBeenCalledWith("?direction=INCOMING", {
      scroll: false,
    });
    expect(incoming).toHaveFocus();
  });

  it("clears search and category together and requests the first unfiltered page", async () => {
    const user = setup();
    await screen.findByText("0 letters");
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "venue");
    await user.click(
      screen.getByRole("combobox", { name: "Filter by category" }),
    );
    await user.click(screen.getByRole("option", { name: "Marketing" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/letters",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              search: "venue",
              category: "MKT",
              page: 1,
            }),
          },
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      get.mock.calls.filter(([path]) => path === "/api/v1/letters").at(-1)?.[1]
        .params.query,
    ).toEqual({
      direction: "INCOMING",
      page: 1,
      pageSize: 20,
      sort: "date",
      order: "desc",
    });
  });

  it("keeps registration hidden when the create grant is absent", async () => {
    setup({
      ...access,
      grants: [{ permissionKey: "letter.read", scope: "ORGANIZATION" }],
    });
    await screen.findByText("0 letters");
    expect(
      screen.queryByRole("button", { name: "New Letter" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });
});
