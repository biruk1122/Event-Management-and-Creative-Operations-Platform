import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsNavigation } from "./reports-navigation";

const { useCurrentAccess } = vi.hoisted(() => ({ useCurrentAccess: vi.fn() }));
vi.mock("@/features/auth/api/access-queries", () => ({ useCurrentAccess }));

beforeEach(() => useCurrentAccess.mockReset());

describe("ReportsNavigation", () => {
  it("shows the route for any report reader scope", () => {
    useCurrentAccess.mockReturnValue({
      data: { grants: [{ permissionKey: "report.read", scope: "SELF" }] },
      isError: false,
    });
    render(<ReportsNavigation />);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/reports",
    );
  });

  it("hides navigation when access is denied or unavailable", () => {
    useCurrentAccess.mockReturnValue({ data: { grants: [] }, isError: false });
    const { rerender } = render(<ReportsNavigation />);
    expect(
      screen.queryByRole("link", { name: "Reports" }),
    ).not.toBeInTheDocument();
    useCurrentAccess.mockReturnValue({ data: null, isError: true });
    rerender(<ReportsNavigation />);
    expect(
      screen.queryByRole("link", { name: "Reports" }),
    ).not.toBeInTheDocument();
  });
});
