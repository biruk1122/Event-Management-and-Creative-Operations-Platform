import { useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { AnalyticsScreen } from "./analytics-screen";
const state = vi.hoisted(() => ({
  get: vi.fn(),
  url: "",
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: state.get } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        },
        () => state.url,
      ),
    ),
  useRouter: () => ({
    push: (url: string) => {
      state.url = url.split("?")[1] ?? "";
      state.listeners.forEach((listener) => listener());
    },
  }),
}));
const counts = { completed: 2, total: 4, pending: 2, overdue: 1, percent: 50 };
const stamp = {
  asOf: "2026-10-06T08:00:00.000Z",
  freshness: "live-current-state",
};
const reader = {
  userId: "reader-1",
  grants: [
    { permissionKey: "analytics.management.read", scope: "MANAGEMENT" },
    {
      permissionKey: "analytics.department_performance.read",
      scope: "DEPARTMENT",
    },
  ],
} as CurrentAccess;
let access: CurrentAccess | null;
const ok = (data: unknown) => ({ data, response: new Response() });
const fail = (status: number, code = "ANALYTICS_UNAVAILABLE") => ({
  error: { status, code, detail: "private SQL" },
  response: new Response(null, { status }),
});
beforeEach(() => {
  access = reader;
  state.url = "measure=tasks&from=2026-09-01&toExclusive=2026-10-01";
  state.listeners.clear();
  state.get.mockReset();
  state.get.mockImplementation(
    async (
      path: string,
      options: { params?: { query?: Record<string, unknown> } },
    ) => {
      if (path === "/api/v1/auth/me/permissions")
        return access ? ok(access) : fail(401);
      const query = options.params?.query ?? {};
      if (path.endsWith("task-completion"))
        return ok({ ...stamp, ...query, counts });
      if (path.endsWith("departments"))
        return ok({
          ...stamp,
          ...query,
          total: 51,
          items: [{ id: "department-1", ...counts }],
        });
      return ok({ ...stamp, ...query, total: 0, items: [] });
    },
  );
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AnalyticsScreen />
    </QueryClientProvider>,
  );
  return client;
}
const metricCalls = () =>
  state.get.mock.calls.filter(([path]) =>
    path.startsWith("/api/v1/analytics/"),
  );
describe("live analytics integration", () => {
  it("fetches only the selected authorized measure with authoritative counts", async () => {
    setup();
    expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
    expect(metricCalls()).toHaveLength(1);
    expect(metricCalls()[0]?.[0]).toBe("/api/v1/analytics/task-completion");
    expect(
      screen.queryByRole("option", { name: "Employee performance" }),
    ).not.toBeInTheDocument();
  });
  it("never requests metrics for ordinary employees, forbidden deep links or malformed ranges", async () => {
    access = { ...reader, grants: [] };
    const client = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have access",
    );
    expect(metricCalls()).toHaveLength(0);
    access = reader;
    state.url = "measure=employees";
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "requested analytics measure",
      ),
    );
    expect(metricCalls()).toHaveLength(0);
    act(() => {
      state.url = "measure=tasks&from=2026-02-30";
      state.listeners.forEach((listener) => listener());
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter two valid UTC dates.",
    );
    expect(metricCalls()).toHaveLength(0);
  });
  it("sends new filters to the server, resets paging and retains draft filters on retry", async () => {
    state.url =
      "measure=departments&from=2026-09-01&toExclusive=2026-10-01&page=2&pageSize=25";
    setup();
    expect(
      await screen.findByText("Page 2 of 3 · 51 authorized subjects"),
    ).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "50");
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    expect(
      await screen.findByText("Page 1 of 2 · 51 authorized subjects"),
    ).toBeVisible();
    expect(metricCalls().at(-1)?.[1].params.query).toMatchObject({
      page: 1,
      pageSize: 50,
    });
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      await screen.findByText("Page 2 of 2 · 51 authorized subjects"),
    ).toBeVisible();
    await userEvent.type(
      screen.getByLabelText("Subject ID (optional)"),
      "draft-id",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh measure" }),
    );
    expect(
      await screen.findByText(
        /Department performance refreshed from authoritative data/,
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Subject ID (optional)")).toHaveValue(
      "draft-id",
    );
    expect(metricCalls().at(-1)?.[1].params.query.departmentId).toBeUndefined();
  });
  it("does not turn a partial service failure into zeros or retain stale successful counts", async () => {
    setup();
    expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
    state.get.mockImplementation(async (path: string) =>
      path.includes("permissions") ? ok(access) : fail(503),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Analytics measure"),
      "departments",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(screen.getByText(/Some measures are unavailable/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    state.get.mockImplementation(
      async (
        path: string,
        options: { params?: { query?: Record<string, unknown> } },
      ) =>
        path.includes("permissions")
          ? ok(access)
          : ok({ ...stamp, ...options.params?.query, total: 0, items: [] }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/No matching data in your permitted scope/),
    ).toBeVisible();
    expect(screen.queryByText(/private SQL/)).not.toBeInTheDocument();
  });
  it("clears cache/content on grant revocation or permission-check failure", async () => {
    const client = setup();
    expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
    access = { ...reader, grants: [] };
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have access",
    );
    expect(
      client.getQueryCache().findAll({ queryKey: ["analytics"] }),
    ).toHaveLength(0);
    state.get.mockResolvedValue(fail(503));
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cached metrics are hidden",
    );
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
  it.each([401, 403])(
    "fails closed and evicts metrics on an authoritative HTTP %s",
    async (status) => {
      const client = setup();
      expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
      state.get.mockImplementation(async (path: string) =>
        path.includes("permissions") ? ok(access) : fail(status),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Refresh measure" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        status === 401 ? "session expired" : "access changed",
      );
      await waitFor(() =>
        expect(
          client.getQueryCache().findAll({ queryKey: ["analytics"] }),
        ).toHaveLength(0),
      );
      expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    },
  );
  it("re-fetches after a same-grant permission epoch change, rather than showing old department data", async () => {
    const client = setup();
    expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() => {
      expect(screen.getByText("50%", { selector: "p" })).toBeVisible();
      expect(metricCalls()).toHaveLength(2);
    });
    expect(
      client.getQueryCache().findAll({ queryKey: ["analytics"] }),
    ).toHaveLength(1);
  });
  it("does not let a late old-filter response replace the newly selected measure", async () => {
    let complete: (value: unknown) => void = () => {};
    let signal: AbortSignal | undefined;
    state.get.mockImplementation(
      (path: string, options: { signal?: AbortSignal }) => {
        if (path.includes("permissions")) return Promise.resolve(ok(access));
        if (path.endsWith("task-completion")) {
          signal = options.signal;
          return new Promise((resolve) => {
            complete = resolve;
          });
        }
        return Promise.resolve(
          ok({
            ...stamp,
            from: "2026-09-01",
            toExclusive: "2026-10-01",
            page: 1,
            pageSize: 25,
            total: 0,
            items: [],
          }),
        );
      },
    );
    setup();
    expect(await screen.findByText("Loading task completion…")).toBeVisible();
    await userEvent.selectOptions(
      screen.getByLabelText("Analytics measure"),
      "departments",
    );
    expect(
      await screen.findByText(/No matching data in your permitted scope/),
    ).toBeVisible();
    await act(async () => {
      complete(
        ok({ ...stamp, from: "2026-09-01", toExclusive: "2026-10-01", counts }),
      );
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Analytics measure")).toHaveValue(
      "departments",
    );
  });
  it("removes all metrics after session expiry and uses the sign-in recovery path", async () => {
    const client = setup();
    expect(await screen.findByText("50%", { selector: "p" })).toBeVisible();
    access = null;
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "session expired",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fanalytics",
    );
    expect(
      client.getQueryCache().findAll({ queryKey: ["analytics"] }),
    ).toHaveLength(0);
  });
});
