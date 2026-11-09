import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { PromotionWorkspaceScreen } from "./promotion-workspace-screen";

const state = vi.hoisted(() => ({
  access: null as unknown,
  search: "",
  replace: vi.fn(),
}));

vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: () => state.access,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/promotion",
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ replace: state.replace }),
}));
// The embedded module screens have their own tests; here we only check which
// one is shown and whether it is read-only.
vi.mock("@/features/campaigns/components/campaigns-screen", () => ({
  CampaignsScreen: (props: { initialType?: string; readOnly?: boolean }) => (
    <p>
      campaigns:{props.initialType}:{props.readOnly ? "read-only" : "editable"}
    </p>
  ),
}));
vi.mock("@/features/tasks/components/tasks-screen", () => ({
  TasksScreen: (props: { readOnly?: boolean; departmentId?: string }) => (
    <p>
      tasks:{props.readOnly ? "read-only" : "editable"}:
      {props.departmentId ?? "all"}
    </p>
  ),
}));
vi.mock("@/features/partners/components/partners-screen", () => ({
  PartnersScreen: (props: { readOnly?: boolean }) => (
    <p>partners:{props.readOnly ? "read-only" : "editable"}</p>
  ),
}));
vi.mock(
  "@/features/creative-requests/components/creative-requests-screen",
  () => ({
    CreativeRequestsScreen: (props: { readOnly?: boolean }) => (
      <p>creative-requests:{props.readOnly ? "read-only" : "editable"}</p>
    ),
  }),
);
vi.mock("@/features/tasks/api/tasks-gateway", () => ({
  listAssignableDepartments: () =>
    Promise.resolve([
      { id: "dept-mkt", name: "Marketing" },
      { id: "dept-promo", name: "Promotion" },
    ]),
}));
vi.mock("@/features/promotion-budget/components/promotion-budget-view", () => ({
  PromotionBudgetView: (props: { readOnly?: boolean }) => (
    <p>budget:{props.readOnly ? "read-only" : "editable"}</p>
  ),
}));
vi.mock("./promotion-activities-view", () => ({
  PromotionActivitiesView: (props: { mode: string }) => (
    <p>activities:{props.mode}</p>
  ),
}));
vi.mock("./promotion-overview", () => ({
  PromotionOverview: () => <p>overview-dashboard</p>,
}));
vi.mock("./promotion-events-view", () => ({
  PromotionEventsView: () => <p>event-promotions</p>,
}));
vi.mock("./promotion-calendar-view", () => ({
  PromotionCalendarView: (props: {
    departmentId: string | null;
    sources: { events: boolean; activities: boolean; deadlines: boolean };
  }) => (
    <p>
      calendar:{props.departmentId ?? "none"}:
      {props.sources.events ? "events" : "-"}:
      {props.sources.deadlines ? "deadlines" : "-"}
    </p>
  ),
}));
vi.mock("@/features/reports/components/reports-screen", () => ({
  ReportsScreen: (props: { readOnly?: boolean }) => (
    <p>reports:{props.readOnly ? "read-only" : "editable"}</p>
  ),
}));

const READS: CurrentAccess["grants"] = [
  "campaign.read",
  "campaign.budget.read",
  "task.read",
  "partner.read",
  "report.read",
  "creative_request.read",
].map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function signedIn(data: Partial<CurrentAccess>) {
  state.access = {
    isPending: false,
    isError: false,
    data: {
      userId: "user-1",
      role: null,
      department: null,
      grants: READS,
      overseenDepartments: [],
      ...data,
    },
    refetch: vi.fn(),
  };
}

const promotionManager = {
  role: "DEPARTMENT_MANAGER" as const,
  department: { id: "dept-promo", name: "Promotion", active: true },
};
const marketingManager = {
  role: "DEPARTMENT_MANAGER" as const,
  department: { id: "dept-mkt", name: "Marketing", active: true },
  overseenDepartments: [{ id: "dept-promo", name: "Promotion" }],
};

describe("PromotionWorkspaceScreen", () => {
  beforeEach(() => {
    state.search = "";
    state.replace.mockReset();
  });

  it("shows the ten sections and the overview for the Promotional Manager", () => {
    signedIn(promotionManager);
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("Promotional Manager")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Promotion workspace sections",
    });
    expect(nav.querySelectorAll("button")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByText("View-only oversight")).not.toBeInTheDocument();
    expect(screen.getByText("overview-dashboard")).toBeInTheDocument();
  });

  it("shows team members section shortcuts instead of the campaign dashboard", () => {
    signedIn({
      role: "DEPARTMENT_MEMBER",
      department: { id: "dept-promo", name: "Promotion", active: true },
      grants: [{ permissionKey: "task.read", scope: "DEPARTMENT" }],
    });
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.queryByText("overview-dashboard")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Event Promotions" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Team Tasks/ }).length).toBe(
      2,
    );
  });

  it("shows the promotional activities list", () => {
    signedIn(promotionManager);
    state.search = "tab=activities";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("activities:list")).toBeInTheDocument();
  });

  it("shows the combined calendar with events and the team deadlines (EVE-234)", () => {
    signedIn(promotionManager);
    state.search = "tab=calendar";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(
      screen.getByText("calendar:dept-promo:events:deadlines"),
    ).toBeInTheDocument();
  });

  it("keeps the section in the URL", async () => {
    signedIn(promotionManager);
    render(<PromotionWorkspaceScreen />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Team Tasks" }));
    expect(state.replace).toHaveBeenCalledWith("/promotion?tab=tasks", {
      scroll: false,
    });
  });

  it("embeds the existing module screens, editable for the department", () => {
    signedIn(promotionManager);
    state.search = "tab=campaigns";
    const { unmount } = render(<PromotionWorkspaceScreen />, { wrapper });
    expect(
      screen.getByText("campaigns:PROMOTION:editable"),
    ).toBeInTheDocument();
    unmount();
    state.search = "tab=tasks";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("tasks:editable:dept-promo")).toBeInTheDocument();
  });

  it("fixes Team Tasks to Promotion, looking the department up for Super Admin", async () => {
    signedIn({ role: "SUPER_ADMIN", department: null });
    state.search = "tab=tasks";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(
      await screen.findByText("tasks:editable:dept-promo"),
    ).toBeInTheDocument();
  });

  it("shows creative requests, read-only for the overseeing manager", () => {
    signedIn(promotionManager);
    state.search = "tab=creative-requests";
    const { unmount } = render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("creative-requests:editable")).toBeInTheDocument();
    unmount();
    signedIn(marketingManager);
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("creative-requests:read-only")).toBeInTheDocument();
  });

  it("shows the event promotions, for the overseeing manager too (EVE-234)", () => {
    signedIn(promotionManager);
    state.search = "tab=event-promotions";
    const { unmount } = render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("event-promotions")).toBeInTheDocument();
    unmount();
    signedIn(marketingManager);
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("event-promotions")).toBeInTheDocument();
    expect(
      screen.queryByText(/coming in a later phase/),
    ).not.toBeInTheDocument();
  });

  it("shows the budget section, read-only for the overseeing manager (EVE-233)", () => {
    signedIn(promotionManager);
    state.search = "tab=budget";
    const { unmount } = render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("budget:editable")).toBeInTheDocument();
    unmount();
    signedIn(marketingManager);
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("budget:read-only")).toBeInTheDocument();
  });

  it("opens read-only for the Marketing Manager", () => {
    signedIn(marketingManager);
    state.search = "tab=partnerships";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByText("View-only oversight")).toBeInTheDocument();
    expect(
      screen.getByText("Marketing Manager · read-only"),
    ).toBeInTheDocument();
    expect(screen.getByText("partners:read-only")).toBeInTheDocument();
  });

  it("names the outer workspace landmark the same on every section", () => {
    signedIn(promotionManager);
    state.search = "tab=activities";
    const { unmount } = render(<PromotionWorkspaceScreen />, { wrapper });
    expect(
      screen.getByRole("region", { name: "Promotion workspace" }),
    ).toBeInTheDocument();
    unmount();
    state.search = "tab=budget";
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(
      screen.getByRole("region", { name: "Promotion workspace" }),
    ).toBeInTheDocument();
  });

  it("refuses anyone outside Promotion and its oversight", () => {
    signedIn({
      role: "DEPARTMENT_MEMBER",
      department: { id: "dept-mkt", name: "Marketing", active: true },
    });
    render(<PromotionWorkspaceScreen />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You do not have access to this area.",
    );
  });
});
