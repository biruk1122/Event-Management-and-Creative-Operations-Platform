import { render, screen } from "@testing-library/react";
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
  TasksScreen: (props: { readOnly?: boolean }) => (
    <p>tasks:{props.readOnly ? "read-only" : "editable"}</p>
  ),
}));
vi.mock("@/features/partners/components/partners-screen", () => ({
  PartnersScreen: (props: { readOnly?: boolean }) => (
    <p>partners:{props.readOnly ? "read-only" : "editable"}</p>
  ),
}));
vi.mock("./promotion-activities-view", () => ({
  PromotionActivitiesView: (props: { mode: string }) => (
    <p>activities:{props.mode}</p>
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
].map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" }));

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
    render(<PromotionWorkspaceScreen />);
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
  });

  it("shows the promotional activities list and calendar, built in this phase", () => {
    signedIn(promotionManager);
    state.search = "tab=activities";
    const { unmount } = render(<PromotionWorkspaceScreen />);
    expect(screen.getByText("activities:list")).toBeInTheDocument();
    unmount();
    state.search = "tab=calendar";
    render(<PromotionWorkspaceScreen />);
    expect(screen.getByText("activities:calendar")).toBeInTheDocument();
  });

  it("keeps the section in the URL", async () => {
    signedIn(promotionManager);
    render(<PromotionWorkspaceScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Team Tasks" }));
    expect(state.replace).toHaveBeenCalledWith("/promotion?tab=tasks", {
      scroll: false,
    });
  });

  it("embeds the existing module screens, editable for the department", () => {
    signedIn(promotionManager);
    state.search = "tab=campaigns";
    const { unmount } = render(<PromotionWorkspaceScreen />);
    expect(
      screen.getByText("campaigns:PROMOTION:editable"),
    ).toBeInTheDocument();
    unmount();
    state.search = "tab=tasks";
    render(<PromotionWorkspaceScreen />);
    expect(screen.getByText("tasks:editable")).toBeInTheDocument();
  });

  it("shows a clear coming-later state, never data, for sections not built yet", () => {
    signedIn(promotionManager);
    state.search = "tab=budget";
    render(<PromotionWorkspaceScreen />);
    expect(
      screen.getByText("Budget is coming in a later phase"),
    ).toBeInTheDocument();
  });

  it("opens read-only for the Marketing Manager", () => {
    signedIn(marketingManager);
    state.search = "tab=partnerships";
    render(<PromotionWorkspaceScreen />);
    expect(screen.getByText("View-only oversight")).toBeInTheDocument();
    expect(
      screen.getByText("Marketing Manager · read-only"),
    ).toBeInTheDocument();
    expect(screen.getByText("partners:read-only")).toBeInTheDocument();
  });

  it("names the outer workspace landmark the same on every section", () => {
    signedIn(promotionManager);
    state.search = "tab=activities";
    const { unmount } = render(<PromotionWorkspaceScreen />);
    expect(
      screen.getByRole("region", { name: "Promotion workspace" }),
    ).toBeInTheDocument();
    unmount();
    state.search = "tab=budget";
    render(<PromotionWorkspaceScreen />);
    expect(
      screen.getByRole("region", { name: "Promotion workspace" }),
    ).toBeInTheDocument();
  });

  it("refuses anyone outside Promotion and its oversight", () => {
    signedIn({
      role: "DEPARTMENT_MEMBER",
      department: { id: "dept-mkt", name: "Marketing", active: true },
    });
    render(<PromotionWorkspaceScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You do not have access to this area.",
    );
  });
});
