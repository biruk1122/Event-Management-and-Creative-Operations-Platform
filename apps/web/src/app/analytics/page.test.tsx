import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ createServerApi: () => api }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "session=test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`Redirect:${url}`);
  },
}));
import AnalyticsPage from "./page";

describe("analytics server route", () => {
  beforeEach(() => api.GET.mockReset());
  it("redirects expired sessions before rendering analytics", async () => {
    api.GET.mockResolvedValue({ response: { status: 401 } });
    await expect(AnalyticsPage()).rejects.toThrow(
      "Redirect:/login?next=%2Fanalytics",
    );
  });
  it("fails closed when permissions cannot be checked", async () => {
    api.GET.mockResolvedValue({ response: { status: 503 } });
    await expect(AnalyticsPage()).rejects.toThrow("check your permissions");
  });
  it("denies employees without analytics grants even with dashboard access", async () => {
    api.GET.mockResolvedValue({
      response: { status: 200 },
      data: { grants: [{ permissionKey: "dashboard.read", scope: "SELF" }] },
    });
    render(await AnalyticsPage());
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    expect(api.GET).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/auth/me/permissions",
      { cache: "no-store" },
    );
  });
  it("renders an honest department-only shell without issuing metric requests", async () => {
    api.GET.mockResolvedValue({
      response: { status: 200 },
      data: {
        grants: [
          {
            permissionKey: "analytics.department_performance.read",
            scope: "DEPARTMENT",
          },
        ],
      },
    });
    render(await AnalyticsPage());
    expect(
      screen.getByRole("option", { name: "Department performance" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Employee performance" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Your current department only/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("EVE-175");
    expect(api.GET).toHaveBeenCalledOnce();
  });
});
