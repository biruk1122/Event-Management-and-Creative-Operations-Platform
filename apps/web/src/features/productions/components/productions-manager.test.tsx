import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { Production } from "../lib/production-types";
import { ProductionsManager } from "./productions-manager";

vi.mock("@/features/auth/api/access-queries", () => ({
  accessKey: ["auth", "access"],
}));

const api = vi.hoisted(() => ({
  listProductions: vi.fn(),
  getProduction: vi.fn(),
  listProductionPeople: vi.fn(),
  listProductionTeams: vi.fn(),
  listProductionTalents: vi.fn(),
  createProduction: vi.fn(),
  updateProduction: vi.fn(),
  transitionProduction: vi.fn(),
  assignProductionManager: vi.fn(),
  assignProductionTeam: vi.fn(),
  removeProductionTeam: vi.fn(),
  addProductionMember: vi.fn(),
  removeProductionMember: vi.fn(),
  assignProductionTalent: vi.fn(),
  removeProductionTalent: vi.fn(),
  deleteProduction: vi.fn(),
}));
vi.mock("../api/productions-gateway", () => api);

const now = "2026-09-01T09:00:00.000Z";
const production: Production = {
  id: "p1",
  workspaceId: "w1",
  name: "Launch film",
  productionType: "Video Production",
  description: null,
  startAt: null,
  endAt: null,
  deadlineAt: now,
  status: "PLANNED",
  manager: null,
  teams: [],
  participants: [],
  talents: [],
  createdBy: null,
  createdAt: now,
  updatedAt: now,
};
function access(...keys: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["project.read", ...keys].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}
function setup(
  current = access("project.create", "project.update", "project.assign"),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ProductionsManager access={current} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listProductions.mockImplementation(async (params: { page: number }) => ({
    items: params.page === 1 ? [production] : [],
    page: params.page,
    pageSize: 10,
    total: 1,
  }));
  api.getProduction.mockResolvedValue(production);
  api.listProductionPeople.mockResolvedValue([]);
  api.listProductionTeams.mockResolvedValue([]);
  api.listProductionTalents.mockResolvedValue([]);
});

describe("ProductionsManager live state", () => {
  it("loads API rows, opens an API detail, and sends server-side filters", async () => {
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText("1 production")).toBeVisible();
    expect(api.listProductions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: /Launch film/ }));
    expect(
      await screen.findByRole("region", { name: "Production details" }),
    ).toBeVisible();
    expect(api.getProduction).toHaveBeenCalledWith("p1", expect.anything());
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await waitFor(() =>
      expect(api.listProductions).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE", page: 1 }),
        expect.anything(),
      ),
    );
  });

  it("creates through the mutation and refreshes the production and workspace caches", async () => {
    const user = userEvent.setup();
    api.createProduction.mockResolvedValue({
      ...production,
      id: "p2",
      name: "New film",
    });
    const { client } = setup();
    client.setQueryData(["workspaces", "operator-1", "sample"], { items: [] });
    await screen.findByText("1 production");
    await user.click(screen.getByRole("button", { name: "New production" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New film");
    await user.type(within(dialog).getByLabelText("Production type"), "Video");
    await user.click(
      within(dialog).getByRole("button", { name: "Save production" }),
    );
    await waitFor(() =>
      expect(api.createProduction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New film" }),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(
        client.getQueryState(["workspaces", "operator-1", "sample"])
          ?.isInvalidated,
      ).toBe(true),
    );
  });

  it("keeps write actions permission-gated", async () => {
    setup(access());
    expect(await screen.findByText("1 production")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New production" }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Launch film/ }));
    const details = await screen.findByRole("region", {
      name: "Production details",
    });
    expect(
      within(details).queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
  });

  it("shows a recoverable list error", async () => {
    api.listProductions.mockRejectedValueOnce(
      new Error("We could not load production data. Try again."),
    );
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not load",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 production")).toBeVisible();
  });
});
