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
vi.mock("@/features/analytics/components/analytics-screen", () => ({
  AnalyticsScreen: () => <p role="status">Live analytics integration</p>,
}));

describe("analytics server route", () => {
  beforeEach(() => {
    api.GET.mockReset();
  });
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
  it("renders the live screen only after a scoped analytics grant is checked", async () => {
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
    expect(screen.getByRole("status")).toHaveTextContent(
      "Live analytics integration",
    );
    expect(screen.getByRole("main")).toHaveClass("w-full", "min-w-0");
    expect(api.GET).toHaveBeenCalledOnce();
  });
});
