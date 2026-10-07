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
import DashboardPage from "./page";
vi.mock("@/features/dashboards/components/dashboard-screen", () => ({
  DashboardScreen: () => <p role="status">Live dashboard integration</p>,
}));
describe("dashboard server route", () => {
  beforeEach(() => api.GET.mockReset());
  it("redirects expired sessions", async () => {
    api.GET.mockResolvedValue({ response: { status: 401 } });
    await expect(DashboardPage()).rejects.toThrow(
      "Redirect:/login?next=%2Fdashboard",
    );
  });
  it("fails closed on permission lookup failure", async () => {
    api.GET.mockResolvedValue({ response: { status: 503 } });
    await expect(DashboardPage()).rejects.toThrow("check your permissions");
  });
  it.each([
    ["dashboard.read", "SELF", "My work"],
    ["dashboard.management.read", "MANAGEMENT", "Management overview"],
  ])("renders a protected live %s view", async (permissionKey, scope) => {
    api.GET.mockResolvedValue({
      response: { status: 200 },
      data: {
        userId: "actor",
        grants: [
          { permissionKey, scope },
          { permissionKey: "task.read", scope: "ORGANIZATION" },
        ],
      },
    });
    render(await DashboardPage());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Live dashboard integration",
    );
    expect(api.GET).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/auth/me/permissions",
      { cache: "no-store" },
    );
  });
  it("denies missing entry capabilities", async () => {
    api.GET.mockResolvedValue({
      response: { status: 200 },
      data: { userId: "actor", grants: [] },
    });
    render(await DashboardPage());
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
  });
});
