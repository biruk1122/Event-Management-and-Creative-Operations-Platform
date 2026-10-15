import { useSyncExternalStore } from "react";
import { renderToString } from "react-dom/server";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
// Tasks, departments, and monthly activity are permanently pinned on the
// Analytics page (see `PinnedAnalyticsPanel`); this fixture grants all three
// plus the general management grant that unlocks the dropdown-selectable
// measures (events/campaigns/promotion).
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
  // No `measure` param: the dropdown below the pinned panels falls back to
  // its own first allowed choice (tasks/departments/monthly are excluded
  // from it, since they are pinned - see `AnalyticsManager`).
  state.url = "";
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
      if (
        path.endsWith("departments") ||
        path.endsWith("events") ||
        path.endsWith("campaigns")
      )
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
const callsTo = (suffix: string) =>
  metricCalls().filter(([path]) => path.endsWith(suffix));
/** Scopes queries to one of the three permanently pinned panels, by its
 * card heading. */
function pinnedPanel(title: string) {
  return within(
    screen
      .getByRole("heading", { name: title })
      .closest('[data-slot="card"]') as HTMLElement,
  );
}
/** Scopes queries to the single-measure dropdown's own results section
 * (an ARIA region, since `AnalyticsWorkspace` labels it). */
function dropdownResults(measureLabel: string) {
  return within(screen.getByRole("region", { name: measureLabel }));
}
/** Scopes queries to the single-measure dropdown's own filter form (a
 * labelled `<form>`, exposed with role "form"). */
function dropdownForm(measureLabel: string) {
  return within(screen.getByRole("form", { name: `${measureLabel} filters` }));
}
describe("live analytics integration", () => {
  it("server-renders useful public context while keeping controls and metrics permission-gated", () => {
    const client = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={client}>
        <AnalyticsScreen />
      </QueryClientProvider>,
    );
    expect(html).toContain("Work delivery analytics");
    expect(html).toContain("Each measure requires its own scoped grant.");
    expect(html).toContain("Checking current analytics permissions");
    expect(html).not.toContain("Eligible tasks");
    expect(html).not.toContain("<select");
    expect(metricCalls()).toHaveLength(0);
  });
  it("shows all three pinned panels plus the dropdown's own first allowed measure, and never lists a pinned measure as a dropdown option", async () => {
    const client = setup();
    const heading = screen.getByRole("heading", {
      name: "Work delivery analytics",
    });
    await screen.findByRole("heading", { name: "Task completion rate" });
    expect(
      await pinnedPanel("Task completion rate").findByText("50%"),
    ).toBeVisible();
    pinnedPanel("Department performance");
    pinnedPanel("Monthly activity");
    await waitFor(() => expect(callsTo("task-completion")).toHaveLength(1));
    await waitFor(() => expect(callsTo("departments")).toHaveLength(1));
    await waitFor(() => expect(callsTo("monthly-activity")).toHaveLength(1));
    await waitFor(() => expect(callsTo("events")).toHaveLength(1));
    expect(callsTo("campaigns")).toHaveLength(0);
    expect(callsTo("promotion")).toHaveLength(0);
    const select = screen.getByLabelText("Analytics measure");
    expect(select).toHaveValue("events");
    for (const excluded of [
      "Task completion",
      "Department performance",
      "Monthly activity",
      "Employee performance",
    ])
      expect(
        screen.queryByRole("option", { name: excluded }),
      ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Work delivery analytics" }),
    ).toBe(heading);
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() =>
      expect(
        pinnedPanel("Task completion rate").getByText("50%"),
      ).toBeVisible(),
    );
  });
  it("never requests metrics for ordinary employees or forbidden deep links, and validates pinned-panel dates client-side", async () => {
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
    expect(callsTo("employees")).toHaveLength(0);
    // Date validation for a pinned measure now happens inside its own panel,
    // never via a URL parameter (pinned panels hold no router state).
    const monthly = pinnedPanel("Monthly activity");
    await monthly.findByLabelText("Activity month start (UTC)");
    await waitFor(() =>
      expect(
        monthly.getByRole("button", { name: "Apply filters" }),
      ).not.toBeDisabled(),
    );
    await userEvent.clear(monthly.getByLabelText("End (exclusive, UTC)"));
    await userEvent.type(
      monthly.getByLabelText("End (exclusive, UTC)"),
      "2026-09-01",
    );
    await userEvent.click(
      monthly.getByRole("button", { name: "Apply filters" }),
    );
    expect(monthly.getByRole("alert")).toHaveTextContent(
      "End (exclusive) must be after start.",
    );
  });
  it("sends new filters to the pinned department panel, resets paging and retains draft filters on retry", async () => {
    setup();
    await screen.findByRole("heading", { name: "Department performance" });
    const panel = pinnedPanel("Department performance");
    expect(
      await panel.findByText("Page 1 of 3 · 51 authorized subjects"),
    ).toBeVisible();
    await userEvent.selectOptions(panel.getByLabelText("Rows per page"), "50");
    await userEvent.click(panel.getByRole("button", { name: "Apply filters" }));
    expect(
      await panel.findByText("Page 1 of 2 · 51 authorized subjects"),
    ).toBeVisible();
    expect(callsTo("departments").at(-1)?.[1].params.query).toMatchObject({
      page: 1,
      pageSize: 50,
    });
    await userEvent.click(panel.getByRole("button", { name: "Next page" }));
    expect(
      await panel.findByText("Page 2 of 2 · 51 authorized subjects"),
    ).toBeVisible();
    await userEvent.type(
      panel.getByLabelText("Department ID (optional)"),
      "draft-id",
    );
    await userEvent.click(
      panel.getByRole("button", { name: "Refresh measure" }),
    );
    expect(
      await panel.findByText(
        /Department performance refreshed from authoritative data/,
      ),
    ).toBeVisible();
    expect(panel.getByLabelText("Department ID (optional)")).toHaveValue(
      "draft-id",
    );
    expect(callsTo("departments").at(-1)?.[1].params.query.departmentId).toBe(
      undefined,
    );
  });
  it("does not turn a partial service failure into zeros or retain stale successful counts", async () => {
    setup();
    await waitFor(() => expect(callsTo("events")).toHaveLength(1));
    state.get.mockImplementation(async (path: string) =>
      path.includes("permissions") ? ok(access) : fail(503),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Analytics measure"),
      "campaigns",
    );
    const results = dropdownResults("Marketing campaign progress");
    expect(await results.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(screen.getByText(/Some measures are unavailable/)).toBeVisible();
    expect(results.queryByRole("table")).not.toBeInTheDocument();
    state.get.mockImplementation(
      async (
        path: string,
        options: { params?: { query?: Record<string, unknown> } },
      ) =>
        path.includes("permissions")
          ? ok(access)
          : ok({ ...stamp, ...options.params?.query, total: 0, items: [] }),
    );
    await userEvent.click(results.getByRole("button", { name: "Try again" }));
    expect(
      await results.findByText(/No matching data in your permitted scope/),
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
      await waitFor(() => expect(callsTo("task-completion")).toHaveLength(1));
      state.get.mockImplementation(async (path: string) =>
        path.includes("permissions") ? ok(access) : fail(status),
      );
      await userEvent.click(
        pinnedPanel("Task completion rate").getByRole("button", {
          name: "Refresh measure",
        }),
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
  it("re-fetches after a same-grant permission epoch change, rather than showing old data", async () => {
    const client = setup();
    await waitFor(() => expect(metricCalls()).toHaveLength(4));
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() => {
      expect(metricCalls()).toHaveLength(8);
    });
    expect(
      client.getQueryCache().findAll({ queryKey: ["analytics"] }),
    ).toHaveLength(4);
  });
  it.each(["revalidation", "focus"])(
    "preserves unapplied dropdown filters after %s without applying them",
    async (trigger) => {
      state.url = "measure=events";
      const client = setup();
      await screen.findByText("Page 1 of 3 · 51 authorized subjects", {
        selector: "p",
      });
      const subject = "11111111-1111-4111-8111-111111111111";
      await userEvent.type(
        screen.getByLabelText("Subject ID (optional)"),
        subject,
      );
      await userEvent.selectOptions(
        dropdownForm("Event progress").getByLabelText("Rows per page"),
        "50",
      );
      await waitFor(() => expect(metricCalls()).toHaveLength(4));
      if (trigger === "focus") {
        await act(async () => {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
        });
        focusManager.setFocused(undefined);
      } else {
        await act(async () => {
          await client.invalidateQueries({ queryKey: accessKey });
        });
      }
      await waitFor(() => expect(metricCalls()).toHaveLength(8));
      await waitFor(() =>
        expect(screen.getByLabelText("Subject ID (optional)")).toHaveValue(
          subject,
        ),
      );
      expect(
        dropdownForm("Event progress").getByLabelText("Rows per page"),
      ).toHaveValue("50");
      expect(callsTo("events").at(-1)?.[1].params.query).toMatchObject({
        pageSize: 25,
      });
      expect(
        callsTo("events").at(-1)?.[1].params.query.eventId,
      ).toBeUndefined();
      expect(
        client.getQueryCache().findAll({ queryKey: ["analytics"] }),
      ).toHaveLength(4);
    },
  );
  it("preserves drafts through an in-flight permission check but never across users", async () => {
    state.url = "measure=events";
    const client = setup();
    await screen.findByText("Page 1 of 3 · 51 authorized subjects", {
      selector: "p",
    });
    await userEvent.type(
      screen.getByLabelText("Subject ID (optional)"),
      "unfinished-draft",
    );
    let complete: (value: unknown) => void = () => {};
    state.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    act(() => {
      void client.invalidateQueries({ queryKey: accessKey });
    });
    await screen.findByText("Checking current analytics permissions…");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      client.getQueryCache().findAll({ queryKey: ["analytics"] }),
    ).toHaveLength(0);
    await act(async () => {
      complete(ok(access));
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Subject ID (optional)")).toHaveValue(
        "unfinished-draft",
      ),
    );
    access = { ...reader, userId: "another-user" };
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Subject ID (optional)")).toHaveValue(""),
    );
  });
  it("does not let a late old-measure response replace the newly selected dropdown measure", async () => {
    let complete: (value: unknown) => void = () => {};
    let signal: AbortSignal | undefined;
    state.get.mockImplementation(
      (path: string, options: { signal?: AbortSignal }) => {
        if (path.includes("permissions")) return Promise.resolve(ok(access));
        if (path.endsWith("/events")) {
          signal = options.signal;
          return new Promise((resolve) => {
            complete = resolve;
          });
        }
        return Promise.resolve(ok({ ...stamp, total: 0, items: [] }));
      },
    );
    setup();
    expect(await screen.findByText("Loading event progress…")).toBeVisible();
    await userEvent.selectOptions(
      screen.getByLabelText("Analytics measure"),
      "campaigns",
    );
    expect(
      await dropdownResults("Marketing campaign progress").findByText(
        /No matching data in your permitted scope/,
      ),
    ).toBeVisible();
    await act(async () => {
      complete(
        ok({
          ...stamp,
          page: 1,
          pageSize: 25,
          total: 1,
          items: [{ id: "event-1", ...counts }],
        }),
      );
    });
    expect(signal?.aborted).toBe(true);
    expect(
      dropdownResults("Marketing campaign progress").queryByText("event-1"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Analytics measure")).toHaveValue("campaigns");
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
