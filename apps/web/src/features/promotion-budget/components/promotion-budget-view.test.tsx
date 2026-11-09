import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import type { CampaignBudgetSummary } from "../api/budget-gateway";
import { PromotionBudgetView } from "./promotion-budget-view";

const state = vi.hoisted(() => ({ access: null as unknown }));
const gateways = vi.hoisted(() => ({
  listPromotionBudgetSummaries: vi.fn(),
  listExpenses: vi.fn(),
  listCampaignActivities: vi.fn(),
}));

vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: () => state.access,
  accessKey: ["access"],
}));
vi.mock("../api/budget-gateway", () => ({
  listPromotionBudgetSummaries: gateways.listPromotionBudgetSummaries,
}));
vi.mock("@/features/expenses/api/expenses-gateway", () => ({
  listExpenses: gateways.listExpenses,
  listAssignableSuppliers: () => Promise.resolve([]),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  submitExpense: vi.fn(),
  reviewExpense: vi.fn(),
  getExpense: vi.fn(),
}));
vi.mock("@/features/campaigns/api/campaigns-gateway", () => ({
  listCampaignActivities: gateways.listCampaignActivities,
  setCampaignBudget: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function signedIn(keys: string[]) {
  state.access = {
    isPending: false,
    data: {
      userId: "user-1",
      role: "DEPARTMENT_MANAGER",
      department: { id: "dept-promo", name: "Promotion", active: true },
      grants: keys.map((permissionKey) => ({
        permissionKey,
        scope: "DEPARTMENT",
      })),
      overseenDepartments: [],
    } satisfies Partial<CurrentAccess>,
  };
}

function summary(
  overrides: Partial<CampaignBudgetSummary> = {},
): CampaignBudgetSummary {
  return {
    campaignId: "camp-1",
    campaignName: "Festival launch",
    campaignType: "PROMOTION",
    status: "ACTIVE",
    currency: "ETB",
    allocated: "1000.00",
    approved: "100.10",
    pending: "200.20",
    spent: "300.30",
    remaining: "699.70",
    utilizationPercent: 30,
    overBudget: false,
    otherCurrencyExpenseCount: 0,
    byActivity: [
      {
        campaignActivityId: "act-1",
        activityName: "Flyer run",
        spent: "100.10",
      },
    ],
    committedPartnershipValue: "5000.00",
    otherCurrencyPartnershipCount: 0,
    partnerships: [
      {
        id: "p-1",
        partnershipName: "Media partnership",
        organizationName: "Brightside Media",
        status: "COMMITTED",
        agreedValueAmount: "5000.00",
        agreedValueCurrency: "ETB",
      },
    ],
    ...overrides,
  };
}

const MANAGER_KEYS = [
  "campaign.budget.read",
  "campaign.budget.update",
  "expense.read",
  "expense.create",
  "expense.update",
  "expense.submit",
];

beforeEach(() => {
  Object.values(gateways).forEach((fn) => fn.mockReset());
  gateways.listExpenses.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  });
  gateways.listCampaignActivities.mockResolvedValue([]);
});

describe("PromotionBudgetView", () => {
  it("shows a campaign's budget, spending by activity and partnerships", async () => {
    signedIn(MANAGER_KEYS);
    gateways.listPromotionBudgetSummaries.mockResolvedValue([summary()]);
    render(<PromotionBudgetView />, { wrapper });
    const detail = await screen.findByRole("article", {
      name: "Festival launch budget",
    });
    expect(within(detail).getByText("1,000.00 ETB")).toBeInTheDocument();
    expect(within(detail).getByText("699.70 ETB")).toBeInTheDocument();
    expect(within(detail).getByText("Flyer run")).toBeInTheDocument();
    expect(
      within(detail).getByText(/Committed partnership value: 5,000.00 ETB/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "All promotion campaigns" }),
    ).toBeInTheDocument();
    expect(
      within(detail).getByRole("button", { name: "New expense" }),
    ).toBeInTheDocument();
    expect(
      within(detail).getByRole("form", { name: "Set campaign budget" }),
    ).toBeInTheDocument();
  });

  it("warns when spending is over budget", async () => {
    signedIn(MANAGER_KEYS);
    gateways.listPromotionBudgetSummaries.mockResolvedValue([
      summary({
        spent: "1200.00",
        remaining: "-200.00",
        utilizationPercent: 120,
        overBudget: true,
      }),
    ]);
    render(<PromotionBudgetView />, { wrapper });
    expect(
      await screen.findByText("Spending is over the allocated budget."),
    ).toBeInTheDocument();
  });

  it("hides every change for the overseeing manager", async () => {
    signedIn(MANAGER_KEYS);
    gateways.listPromotionBudgetSummaries.mockResolvedValue([summary()]);
    render(<PromotionBudgetView readOnly />, { wrapper });
    await screen.findByRole("article", { name: "Festival launch budget" });
    expect(screen.queryByRole("button", { name: "New expense" })).toBeNull();
    expect(
      screen.queryByRole("form", { name: "Set campaign budget" }),
    ).toBeNull();
  });

  it("switches campaigns from the list", async () => {
    signedIn(MANAGER_KEYS);
    gateways.listPromotionBudgetSummaries.mockResolvedValue([
      summary(),
      summary({ campaignId: "camp-2", campaignName: "Radio push" }),
    ]);
    render(<PromotionBudgetView />, { wrapper });
    await screen.findByRole("article", { name: "Festival launch budget" });
    await userEvent.click(screen.getByRole("button", { name: /Radio push/ }));
    expect(
      await screen.findByRole("article", { name: "Radio push budget" }),
    ).toBeInTheDocument();
  });

  it("offers a retry when budgets cannot be loaded", async () => {
    signedIn(MANAGER_KEYS);
    gateways.listPromotionBudgetSummaries.mockRejectedValue(
      new Error("Budgets could not be loaded. Try again."),
    );
    render(<PromotionBudgetView />, { wrapper });
    expect(
      await screen.findByText("Budgets could not be loaded. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
