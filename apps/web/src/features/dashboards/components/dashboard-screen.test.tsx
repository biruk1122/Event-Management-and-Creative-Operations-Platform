import { useSyncExternalStore } from "react";
import { renderToString } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { DashboardScreen } from "./dashboard-screen";
import { DashboardNavigation } from "./dashboard-navigation";
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
const reader: CurrentAccess = {
  userId: "actor",
  grants: [
    { permissionKey: "dashboard.management.read", scope: "MANAGEMENT" },
    { permissionKey: "dashboard.read", scope: "SELF" },
    { permissionKey: "task.read", scope: "ORGANIZATION" },
    { permissionKey: "todo.read", scope: "SELF" },
  ],
};
let access: CurrentAccess | null;
const ok = (data: unknown) => ({ data, response: new Response() });
const fail = (status: number) => ({
  response: new Response(null, { status }),
  error: { status, code: "DASHBOARD_UNAVAILABLE", detail: "private SQL" },
});
const result = (query: Record<string, unknown>, count = 17) => ({
  asOf: "2026-10-07T12:00:00Z",
  day: query.day,
  timeZone: "UTC",
  freshness: "live-current-state",
  partial: false,
  cards: {
    pendingTasks: {
      state: "ready",
      scope: "organization",
      asOf: "2026-10-07T12:00:00Z",
      data: { count },
    },
    completedTasks: { state: "denied" },
    myTasks: {
      state: "ready",
      scope: "self",
      data: {
        items: [{ id: "t", title: "My assigned task", kind: "TASK" }],
        hasMore: false,
      },
    },
  },
});
beforeEach(() => {
  access = reader;
  state.url = "audience=management&day=2026-10-07";
  state.listeners.clear();
  state.get.mockReset();
  focusManager.setFocused(undefined);
  state.get.mockImplementation(
    async (
      path: string,
      options: { params?: { query?: Record<string, unknown> } },
    ) =>
      path.includes("permissions")
        ? access
          ? ok(access)
          : fail(401)
        : ok(result(options.params?.query ?? {})),
  );
});
function setup(navigation = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      {navigation ? <DashboardNavigation /> : <DashboardScreen />}
    </QueryClientProvider>,
  );
  return client;
}
const calls = () =>
  state.get.mock.calls.filter(([path]) => path.includes("/dashboards/"));
describe("live dashboard integration", () => {
  it.each(["revalidation", "focus"])(
    "preserves unapplied filter drafts across same-access %s",
    async (trigger) => {
      const client = setup();
      await screen.findByText("17");
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText("Promotion campaign UUID (optional)"),
        "draft-campaign",
      );
      await user.clear(screen.getByLabelText("Items per list (1–10)"));
      await user.type(screen.getByLabelText("Items per list (1–10)"), "8");
      if (trigger === "focus") {
        act(() => focusManager.setFocused(false));
        act(() => focusManager.setFocused(true));
      } else
        await act(async () => {
          await client.invalidateQueries({ queryKey: accessKey });
        });
      await waitFor(() => expect(calls()).toHaveLength(2));
      expect(
        screen.getByLabelText("Promotion campaign UUID (optional)"),
      ).toHaveValue("draft-campaign");
      expect(screen.getByLabelText("Items per list (1–10)")).toHaveValue(8);
      expect(calls().at(-1)?.[1].params.query).toMatchObject({ limit: 5 });
      expect(
        calls().at(-1)?.[1].params.query.promotionCampaignId,
      ).toBeUndefined();
      focusManager.setFocused(undefined);
    },
  );
  it("server-renders no protected data and issues no dashboard read before access", () => {
    const client = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={client}>
        <DashboardScreen />
      </QueryClientProvider>,
    );
    expect(html).toContain("Checking dashboard access");
    expect(html).not.toContain("Pending tasks");
    expect(calls()).toHaveLength(0);
  });
  it("renders authoritative counts and omits denied cards", async () => {
    setup();
    expect(await screen.findByText("17")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Completed tasks" }),
    ).not.toBeInTheDocument();
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.[1]).toMatchObject({
      cache: "no-store",
      params: { query: { day: "2026-10-07", limit: 5, months: 3 } },
    });
    expect(screen.queryByText(/not connected yet/)).not.toBeInTheDocument();
  });
  it("applies bounded limits/ranges and swaps audiences without carrying analytics fields", async () => {
    setup();
    await screen.findByText("17");
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Items per list (1–10)"));
    await user.type(screen.getByLabelText("Items per list (1–10)"), "10");
    await user.type(screen.getByLabelText("Cohort start (UTC)"), "2026-09-01");
    await user.type(
      screen.getByLabelText("Cohort end (excluded, UTC)"),
      "2026-10-01",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(calls().at(-1)?.[1].params.query).toMatchObject({
        limit: 10,
        from: "2026-09-01",
        toExclusive: "2026-10-01",
      }),
    );
    await screen.findByText("17");
    await user.selectOptions(
      screen.getByLabelText("Dashboard view"),
      "employee",
    );
    expect(await screen.findByText("My assigned task")).toBeVisible();
    expect(calls().at(-1)?.[0]).toBe("/api/v1/dashboards/employee");
    expect(calls().at(-1)?.[1].params.query.from).toBeUndefined();
    expect(screen.queryByText("17")).not.toBeInTheDocument();
  });
  it.each([
    "limit=11",
    "audience=employee&from=2026-01-01",
    "audience=management&departmentId=other",
  ])("does not fetch malformed selection %s", async (url) => {
    state.url = url;
    setup();
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(calls()).toHaveLength(0);
  });
  it("keeps successful siblings during source failures and retries real composition", async () => {
    state.get.mockImplementation(
      async (
        path: string,
        options: { params?: { query?: Record<string, unknown> } },
      ) =>
        path.includes("permissions")
          ? ok(access)
          : ok({
              ...result(options.params?.query ?? {}),
              partial: true,
              cards: {
                pendingTasks: { state: "ready", data: { count: 17 } },
                attentionTasks: {
                  state: "unavailable",
                  retryable: true,
                  requestId: "source-ref",
                },
              },
            }),
    );
    setup();
    await screen.findByText("17");
    await userEvent.click(
      screen.getByRole("button", { name: "Retry tasks requiring attention" }),
    );
    expect(
      await screen.findByText(
        "Dashboard refreshed with partial source failures.",
      ),
    ).toBeVisible();
    expect(calls()).toHaveLength(2);
    expect(screen.getByText("17")).toBeVisible();
  });
  it("labels same-epoch data stale on a transient failure without leaking raw errors", async () => {
    setup();
    await screen.findByText("17");
    state.get.mockImplementation(async (path: string) =>
      path.includes("permissions") ? ok(access) : fail(503),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh dashboard" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be reached",
    );
    expect(screen.getByText("17")).toBeVisible();
    expect(screen.getAllByText(/Stale:/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/private SQL/)).not.toBeInTheDocument();
  });
  it("does not retain old metrics after a non-transient validation failure", async () => {
    setup();
    await screen.findByText("17");
    state.get.mockImplementation(async (path: string) =>
      path.includes("permissions") ? ok(access) : fail(400),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh dashboard" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the dashboard filters",
    );
    expect(screen.queryByText("17")).not.toBeInTheDocument();
    expect(screen.queryByText(/Stale:/)).not.toBeInTheDocument();
  });
  it("aborts an in-flight dashboard read on logout and ignores its late response", async () => {
    const client = setup();
    await screen.findByText("17");
    let resolve!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    state.get.mockImplementation(
      (path: string, options: { signal?: AbortSignal }) =>
        path.includes("permissions")
          ? ok(access)
          : new Promise((done) => {
              resolve = done;
              signal = options.signal;
            }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh dashboard" }),
    );
    await act(async () => {
      client.setQueryData(accessKey, null);
    });
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => resolve(ok(result({ day: "2026-10-07" }, 99))));
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(
      client.getQueryCache().findAll({ queryKey: ["dashboards"] }),
    ).toHaveLength(0);
  });
  it.each([401, 403])(
    "clears protected content and cache on dashboard HTTP %s",
    async (status) => {
      const client = setup();
      await screen.findByText("17");
      state.get.mockImplementation(async (path: string) =>
        path.includes("permissions") ? ok(access) : fail(status),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Refresh dashboard" }),
      );
      await screen.findByRole("alert");
      expect(screen.queryByText("17")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          client.getQueryCache().findAll({ queryKey: ["dashboards"] }),
        ).toHaveLength(0),
      );
    },
  );
  it("hides results during unresolved access and cancels old account queries", async () => {
    const client = setup();
    await screen.findByText("17");
    let resolve!: (value: unknown) => void;
    state.get.mockImplementation((path: string) =>
      path.includes("permissions")
        ? new Promise((done) => {
            resolve = done;
          })
        : ok(result({ day: "2026-10-07" }, 23)),
    );
    act(() => {
      void client.invalidateQueries({ queryKey: accessKey });
    });
    await screen.findByText("Checking dashboard access…");
    expect(screen.queryByText("17")).not.toBeInTheDocument();
    access = { ...reader, userId: "different-account" };
    await act(async () => resolve(ok(access)));
    expect(await screen.findByText("23")).toBeVisible();
    expect(
      client.getQueryCache().findAll({ queryKey: ["dashboards", "actor"] }),
    ).toHaveLength(0);
  });
  it("evicts a same-grant epoch when department or membership may have changed", async () => {
    const client = setup();
    await screen.findByText("17");
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(
      client.getQueryCache().findAll({ queryKey: ["dashboards"] }),
    ).toHaveLength(1);
  });
  it("hides data and navigation after permission revocation or logout", async () => {
    const client = setup();
    await screen.findByText("17");
    access = { ...reader, grants: [] };
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have access",
    );
    expect(screen.queryByText("17")).not.toBeInTheDocument();
    await act(async () => {
      client.setQueryData(accessKey, null);
    });
    expect(
      await screen.findByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login?next=%2Fdashboard");
  });
  it("revalidates access and data on focus and successful real mutations", async () => {
    const client = setup();
    await screen.findByText("17");
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(calls()).toHaveLength(2));
    await act(async () => {
      await client
        .getMutationCache()
        .build(client, { mutationFn: async () => ({ changed: true }) })
        .execute(undefined);
    });
    await waitFor(() => expect(calls()).toHaveLength(3));
    focusManager.setFocused(undefined);
  });
  it("navigation disappears while permissions fail", async () => {
    const client = setup(true);
    expect(
      await screen.findByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
    state.get.mockResolvedValue(fail(503));
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Dashboard" }),
      ).not.toBeInTheDocument(),
    );
  });
});
