import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsNavigation } from "./analytics-navigation";
const { current } = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: current,
}));
describe("analytics navigation", () => {
  it.each([
    "analytics.management.read",
    "analytics.department_performance.read",
    "analytics.employee_performance.read",
  ])("shows the destination only for a valid %s scope", (key) => {
    current.mockReturnValue({
      data: { grants: [{ permissionKey: key, scope: "MANAGEMENT" }] },
    });
    render(<AnalyticsNavigation />);
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute(
      "href",
      "/analytics",
    );
  });
  it.each([
    { data: null },
    { data: { grants: [] } },
    {
      data: {
        grants: [{ permissionKey: "analytics.management.read", scope: "SELF" }],
      },
    },
    {
      data: {
        grants: [
          { permissionKey: "analytics.management.read", scope: "MANAGEMENT" },
        ],
      },
      isError: true,
    },
    {
      data: {
        grants: [
          { permissionKey: "analytics.management.read", scope: "MANAGEMENT" },
        ],
      },
      isFetching: true,
    },
  ])("hides the destination without verified valid grants", (result) => {
    current.mockReturnValue(result);
    render(<AnalyticsNavigation />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
