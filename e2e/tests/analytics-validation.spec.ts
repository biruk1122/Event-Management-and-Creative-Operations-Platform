import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type { components } from "../../packages/api-client/src/generated/schema.js";
import { authStatePath } from "../fixtures/auth.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import {
  assertSchemaName,
  countAppliedMigrations,
  schemaOf,
} from "../fixtures/database.js";
import { apiBaseUrl, repositoryRoot } from "../fixtures/environment.js";
import {
  analyticsDatabaseUrl,
  analyticsPeriod,
  seedAnalyticsFixture,
} from "../fixtures/analytics.js";
import { cardByTitle } from "../fixtures/dashboard.js";

type Schemas = components["schemas"];
let fixture: Awaited<ReturnType<typeof seedAnalyticsFixture>>;
test.beforeAll(async () => {
  fixture = await seedAnalyticsFixture();
});
test.afterAll(async () => {
  await fixture?.cleanup();
});

function selection(
  measure: string,
  subjectId?: string,
  extra: Record<string, string> = {},
) {
  return `/analytics?${new URLSearchParams({ measure, ...analyticsPeriod, ...(subjectId ? { subjectId } : {}), ...extra })}`;
}
function endpoint(path: string, query: Record<string, string | number> = {}) {
  return `${apiBaseUrl}/api/v1/analytics/${path}?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))}`;
}
async function metric<K extends keyof Schemas>(
  page: Page,
  path: string,
  query: Record<string, string | number> = {},
) {
  const response = await page.request.get(endpoint(path, query));
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const data = (await response.json()) as Schemas[K] & {
    asOf: string;
    freshness: string;
  };
  expect(Number.isFinite(Date.parse(data.asOf))).toBe(true);
  expect(data.freshness).toBe("live-current-state");
  return data;
}
async function workRow(
  page: Page,
  id: string,
  completed: number,
  total: number,
  percent: string,
  pending?: number,
  overdue?: number,
) {
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: id, exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.locator("td").nth(0)).toHaveText(`${completed} / ${total}`);
  await expect(row.locator("td").nth(1)).toContainText(percent);
  if (pending !== undefined)
    await expect(row.locator("td").nth(2)).toHaveText(String(pending));
  if (overdue !== undefined)
    await expect(row.locator("td").nth(3)).toHaveText(String(overdue));
}
async function taskCount(page: Page, name: string, value: number) {
  await expect(
    page.getByText(name, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(String(value));
}
/**
 * Task completion, department performance and monthly activity are
 * permanently pinned panels on the Analytics page (not the dropdown below)
 * and hold no router state - their own period/subject fields replace the
 * old `?from=&toExclusive=&subjectId=` URL pattern `selection()` used.
 */
async function applyPinnedFilters(
  panel: ReturnType<Page["locator"]>,
  filters: { from?: string; toExclusive?: string; subjectId?: string },
) {
  if (filters.from !== undefined) {
    const fromField = panel.getByLabel(
      /Activity month start \(UTC\)|Creation period start \(UTC\)/,
    );
    await fromField.fill(filters.from);
  }
  if (filters.toExclusive !== undefined)
    await panel.getByLabel("End (exclusive, UTC)").fill(filters.toExclusive);
  if (filters.subjectId !== undefined)
    await panel.getByLabel("Department ID (optional)").fill(filters.subjectId);
  await panel.getByRole("button", { name: "Apply filters" }).click();
}

test.describe("ANA-06 management fixture journeys", () => {
  test.use({ storageState: authStatePath("manager") });
  test("all seven rendered measures match known authoritative facts", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const task = await metric<"TaskAnalyticsResponse">(
      page,
      "task-completion",
      analyticsPeriod,
    );
    expect(task.counts).toEqual({
      completed: 1,
      total: 3,
      pending: 2,
      overdue: 1,
      percent: 33,
    });
    await page.goto("/analytics");
    const tasksPanel = cardByTitle(page, "Task completion rate");
    await applyPinnedFilters(tasksPanel, analyticsPeriod);
    await expect(
      tasksPanel.getByRole("img", { name: "Completion: 33% (1 of 3)" }),
    ).toBeVisible();
    for (const [name, value] of Object.entries({
      "Eligible tasks": 3,
      Completed: 1,
      Pending: 2,
      Overdue: 1,
    }))
      await taskCount(page, name, value);
    await expect(tasksPanel.locator("time").first()).toHaveAttribute(
      "datetime",
      /T.*Z$/,
    );
    await expectNoWcag22AaViolations(page, "ANA-06 task cohort");

    const department = await metric<"WorkAnalyticsPageResponse">(
      page,
      "departments",
      { ...analyticsPeriod, departmentId: fixture.departmentA },
    );
    expect(department.items).toEqual([
      {
        id: fixture.departmentA,
        completed: 1,
        total: 2,
        pending: 1,
        overdue: 1,
        percent: 50,
      },
    ]);
    const departmentsPanel = cardByTitle(page, "Department performance");
    await applyPinnedFilters(departmentsPanel, {
      ...analyticsPeriod,
      subjectId: fixture.departmentA,
    });
    await expect(
      departmentsPanel.getByRole("img", {
        name: "Department performance comparison",
      }),
    ).toBeVisible();
    await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
    await expectNoWcag22AaViolations(page, "ANA-06 department cohort");

    const employee = await metric<"WorkAnalyticsPageResponse">(
      page,
      "employees",
      { ...analyticsPeriod, employeeId: fixture.employeeId },
    );
    expect(employee.items).toEqual([
      {
        id: fixture.employeeId,
        completed: 1,
        total: 1,
        pending: 0,
        overdue: 0,
        percent: 100,
      },
    ]);
    const manager = await metric<"WorkAnalyticsPageResponse">(
      page,
      "employees",
      { ...analyticsPeriod, employeeId: fixture.managerId },
    );
    expect(manager.items[0]).toMatchObject({
      completed: 1,
      total: 2,
      pending: 1,
      overdue: 1,
      percent: 50,
    });
    await page.goto(selection("employees", fixture.employeeId));
    await expect(
      page.getByRole("figure", { name: "Employee performance comparison" }),
    ).toContainText(
      `Subject: ${fixture.employeeId} — 100% (1 / 1 completed / eligible)`,
    );
    await workRow(page, fixture.employeeId, 1, 1, "100%", 0, 0);
    await expect(
      page.getByText(/employee totals are not additive/),
    ).toBeVisible();
    await expectNoWcag22AaViolations(page, "ANA-06 employee cohort");

    const events = await metric<"ProgressAnalyticsPageResponse">(
      page,
      "events",
      { eventId: fixture.event },
    );
    expect(events.items).toEqual([
      { id: fixture.event, completed: 3, total: 5, percent: 60 },
    ]);
    await page.goto(selection("events", fixture.event));
    await expect(
      page.getByRole("figure", { name: "Event progress comparison" }),
    ).toContainText("60% (3 / 5 completed / eligible)");
    await workRow(page, fixture.event, 3, 5, "60%");
    await expectNoWcag22AaViolations(page, "ANA-06 event progress");

    const campaigns = await metric<"ProgressAnalyticsPageResponse">(
      page,
      "campaigns",
      { campaignId: fixture.marketing, campaignType: "MARKETING" },
    );
    expect(campaigns.items).toEqual([
      { id: fixture.marketing, completed: 1, total: 2, percent: 50 },
    ]);
    await page.goto(selection("campaigns", fixture.marketing));
    await expect(
      page.getByRole("figure", {
        name: "Marketing campaign progress comparison",
      }),
    ).toContainText("50% (1 / 2 completed / eligible)");
    await workRow(page, fixture.marketing, 1, 2, "50%");
    await expectNoWcag22AaViolations(page, "ANA-06 marketing progress");

    const promotion = await metric<"PromotionAnalyticsResponse">(
      page,
      "promotion",
      { campaignId: fixture.promotion },
    );
    expect(promotion.items).toEqual([
      { channel: "RADIO_PROMOTION", completed: 1, total: 2, percent: 50 },
    ]);
    await page.goto(selection("promotion", fixture.promotion));
    await expect(
      page.getByRole("figure", { name: "Promotion performance comparison" }),
    ).toContainText(
      "Channel: radio promotion — 50% (1 / 2 completed / eligible)",
    );
    const radio = page.getByRole("row").filter({
      has: page.getByRole("rowheader", {
        name: "radio promotion",
        exact: true,
      }),
    });
    await expect(radio.locator("td")).toHaveText(["1 / 2", "50%"]);
    await expect(
      page.getByRole("rowheader", { name: "social media" }),
    ).toHaveCount(0);
    await expectNoWcag22AaViolations(page, "ANA-06 promotion denominator");

    const monthly = await metric<"MonthlyAnalyticsResponse">(
      page,
      "monthly-activity",
      analyticsPeriod,
    );
    expect(monthly.items).toEqual([
      {
        month: "2001-09",
        tasksCreated: 4,
        eventsCreated: 2,
        projectsCreated: 1,
        productionsCreated: 1,
        campaignsCreated: 2,
        tasksCompleted: 2,
      },
    ]);
    const monthlyPanel = cardByTitle(page, "Monthly activity");
    await applyPinnedFilters(monthlyPanel, analyticsPeriod);
    await expect(monthlyPanel.getByRole("figure")).toHaveCount(6);
    // The accessible name lives on the role="img" wrapper, but the exact
    // per-point text ("month: value") is its sibling sr-only description
    // inside the same <figure> - Recharts' own rendered SVG ticks (axis
    // labels, not data-point text) are the only text inside the img div
    // itself.
    await expect(
      monthlyPanel
        .getByRole("img", { name: "Tasks created: count by UTC month" })
        .locator(".."),
    ).toContainText("2001-09: 4");
    await expect(
      page
        .getByRole("row")
        .filter({
          has: page.getByRole("rowheader", { name: "2001-09", exact: true }),
        })
        .locator("td"),
    ).toHaveText(["4", "2", "1", "1", "2", "2"]);
    await expectNoWcag22AaViolations(page, "ANA-06 distinct monthly sources");
  });

  test("empty entities, missing subjects and UTC boundaries remain distinct", async ({
    page,
  }) => {
    const empty = await metric<"WorkAnalyticsPageResponse">(
      page,
      "departments",
      { ...analyticsPeriod, departmentId: fixture.emptyDepartment },
    );
    expect(empty.items[0]).toMatchObject({
      completed: 0,
      total: 0,
      pending: 0,
      overdue: 0,
      percent: null,
    });
    await page.goto("/analytics");
    const departmentsPanel = cardByTitle(page, "Department performance");
    await applyPinnedFilters(departmentsPanel, {
      ...analyticsPeriod,
      subjectId: fixture.emptyDepartment,
    });
    await workRow(
      page,
      fixture.emptyDepartment,
      0,
      0,
      "No eligible work",
      0,
      0,
    );
    await applyPinnedFilters(departmentsPanel, { subjectId: randomUUID() });
    await expect(
      departmentsPanel.getByText(/No matching data in your permitted scope/),
    ).toBeVisible();
    await expect(departmentsPanel.getByRole("table")).toHaveCount(0);
    const zero = await metric<"ProgressAnalyticsPageResponse">(page, "events", {
      eventId: fixture.emptyEvent,
    });
    expect(zero.items[0]).toMatchObject({
      completed: 0,
      total: 0,
      percent: null,
    });
    const extended = await metric<"TaskAnalyticsResponse">(
      page,
      "task-completion",
      { ...analyticsPeriod, toExclusive: "2001-10-02" },
    );
    expect(extended.counts).toEqual({
      completed: 2,
      total: 4,
      pending: 2,
      overdue: 1,
      percent: 50,
    });
    const tasksPanel = cardByTitle(page, "Task completion rate");
    await applyPinnedFilters(tasksPanel, {
      ...analyticsPeriod,
      toExclusive: "2001-10-02",
    });
    await taskCount(page, "Eligible tasks", 4);
    const monthlyPanel = cardByTitle(page, "Monthly activity");
    await applyPinnedFilters(monthlyPanel, {
      from: "2000-01-01",
      toExclusive: "2000-03-01",
    });
    for (const month of ["2000-01", "2000-02"])
      await expect(
        monthlyPanel
          .getByRole("rowheader", { name: month, exact: true })
          .locator("..")
          .locator("td"),
      ).toHaveText(["0", "0", "0", "0", "0", "0"]);
  });

  test("bounded pagination follows the server's authorized ID ordering", async ({
    page,
  }) => {
    const first = await metric<"WorkAnalyticsPageResponse">(
      page,
      "departments",
      { ...analyticsPeriod, page: 1, pageSize: 25 },
    );
    const second = await metric<"WorkAnalyticsPageResponse">(
      page,
      "departments",
      { ...analyticsPeriod, page: 2, pageSize: 25 },
    );
    expect(first.total).toBeGreaterThanOrEqual(29);
    expect(first.items).toHaveLength(25);
    expect(second.total).toBe(first.total);
    expect(first.items.map((row) => row.id)).toEqual(
      first.items.map((row) => row.id).sort(),
    );
    expect(
      second.items.some((row) =>
        first.items.some((previous) => previous.id === row.id),
      ),
    ).toBe(false);
    await page.goto("/analytics");
    const panel = cardByTitle(page, "Department performance");
    await applyPinnedFilters(panel, analyticsPeriod);
    await expect(panel.getByRole("rowheader")).toHaveText(
      first.items.map((row) => row.id),
    );
    await panel.getByRole("button", { name: "Next page" }).click();
    await expect(panel.getByRole("rowheader")).toHaveText(
      second.items.map((row) => row.id),
    );
  });

  test("invalid inputs never become broad reads and server bounds return Problem Details", async ({
    page,
  }) => {
    for (const [path, query, code] of [
      [
        "task-completion",
        { ...analyticsPeriod, from: "2001-02-30" },
        "ANALYTICS_INVALID_RANGE",
      ],
      [
        "task-completion",
        { from: "2000-01-01", toExclusive: "2002-01-01" },
        "ANALYTICS_INVALID_RANGE",
      ],
      [
        "departments",
        { ...analyticsPeriod, page: "102", pageSize: "100" },
        "ANALYTICS_INVALID_PAGE",
      ],
      [
        "departments",
        { ...analyticsPeriod, pageSize: "101" },
        "VALIDATION_ERROR",
      ],
      [
        "monthly-activity",
        { from: "2001-09-02", toExclusive: "2001-10-01" },
        "ANALYTICS_INVALID_RANGE",
      ],
    ] as const) {
      const response = await page.request.get(endpoint(path, query));
      expect(response.status()).toBe(400);
      expect(response.headers()["content-type"]).toContain(
        "application/problem+json",
      );
      expect(await response.json()).toMatchObject({ code });
    }
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/analytics/")) requests++;
    });
    await page.goto("/analytics");
    // Three pinned panels fetch concurrently on load; wait for that initial
    // burst to finish before zeroing the counter, or it races the reset.
    await page.waitForLoadState("networkidle");
    requests = 0;
    // Task completion is a pinned panel with no URL filter state - its own
    // date field drives this client-side validation now, never a query
    // parameter. An invalid "page" deep link has no UI equivalent to test:
    // the pinned department panel only exposes Next/Previous page buttons,
    // never a free-typed page number.
    // A real native date input rejects an out-of-range calendar date
    // (there is no 2001-02-30) outright rather than holding it as text, so
    // a backward-but-well-formed range exercises the same client-side
    // `filterError` guard without fighting browser date-input sanitization.
    const tasksPanel = cardByTitle(page, "Task completion rate");
    await tasksPanel
      .getByLabel("End (exclusive, UTC)")
      .fill(analyticsPeriod.from);
    await expect(
      tasksPanel.getByRole("alert").filter({ hasText: "must be after start" }),
    ).toBeVisible();
    expect(requests).toBe(0);
  });

  test("a real source timeout shows partial failure and recovers without synthetic zeroes", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/analytics");
    const departmentsPanel = cardByTitle(page, "Department performance");
    await applyPinnedFilters(departmentsPanel, {
      ...analyticsPeriod,
      subjectId: fixture.departmentA,
    });
    await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
    const db = analyticsDatabaseUrl(),
      schema = schemaOf(db);
    assertSchemaName(schema);
    const lock = new Client({ connectionString: db });
    await lock.connect();
    const tasksPanel = cardByTitle(page, "Task completion rate");
    await applyPinnedFilters(tasksPanel, analyticsPeriod);
    try {
      await lock.query(`SET search_path TO "${schema}"`);
      await lock.query("BEGIN");
      await lock.query("SET LOCAL lock_timeout = '2s'");
      await lock.query("LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE");
      const failed = page.waitForResponse(
        (response) =>
          response.url().includes("/analytics/task-completion") &&
          response.status() === 503,
      );
      // Task completion is pinned and always fetches on its own; forcing a
      // fresh fetch while the table is locked is what reproduces the
      // timeout, not a dropdown measure switch.
      await tasksPanel.getByRole("button", { name: "Refresh measure" }).click();
      const response = await failed;
      expect(await response.json()).toMatchObject({
        code: "ANALYTICS_UNAVAILABLE",
      });
      await expect(
        tasksPanel
          .getByRole("alert")
          .filter({ hasText: "temporarily unavailable" }),
      ).toBeVisible();
      await expect(tasksPanel.getByRole("meter")).toHaveCount(0);
      await expect(
        tasksPanel.getByText("Eligible tasks", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await lock.query("ROLLBACK");
      await lock.end();
    }
    await tasksPanel.getByRole("button", { name: "Try again" }).click();
    await taskCount(page, "Eligible tasks", 3);
    await expect(tasksPanel.getByText(/temporarily unavailable/)).toHaveCount(
      0,
    );
    await expectNoWcag22AaViolations(page, "ANA-06 timeout recovery");
  });

  test("migrations and all seven warm HTTP reads satisfy the quality gate", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const migrationCount = readdirSync(
      `${repositoryRoot}/apps/api/prisma/migrations`,
      { withFileTypes: true },
    ).filter((entry) => entry.isDirectory()).length;
    expect(await countAppliedMigrations(analyticsDatabaseUrl())).toBe(
      migrationCount,
    );
    const timings: Record<string, { samples: number[]; p95: number }> = {};
    for (const [path, query] of [
      ["task-completion", analyticsPeriod],
      ["departments", { ...analyticsPeriod, pageSize: 25 }],
      ["employees", { ...analyticsPeriod, pageSize: 25 }],
      ["events", { eventId: fixture.event }],
      ["campaigns", { campaignId: fixture.marketing }],
      ["promotion", { campaignId: fixture.promotion }],
      ["monthly-activity", analyticsPeriod],
    ] as const) {
      const url = endpoint(path, query);
      expect((await page.request.get(url)).ok()).toBe(true);
      const samples: number[] = [];
      for (let n = 0; n < 20; n++) {
        const started = performance.now();
        expect((await page.request.get(url)).ok()).toBe(true);
        samples.push(performance.now() - started);
      }
      const p95 = [...samples].sort((a, b) => a - b)[18]!;
      timings[path] = { samples, p95 };
      expect(
        p95,
        `${path} warm p95; samples ${JSON.stringify(samples)}`,
      ).toBeLessThanOrEqual(750);
    }
    await testInfo.attach("analytics-http-p95", {
      body: JSON.stringify(
        {
          fixture:
            "small authoritative ANA-06 fixture; not a capacity benchmark",
          timings,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
});

test.describe("ANA-06 department boundary", () => {
  test.use({ storageState: authStatePath("deptManager") });
  test("own department, denied subjects, no department and membership changes stay scoped", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Department performance is a permanently pinned panel for a department
    // manager (not dropdown-selectable), and it has no URL-driven subject
    // filter - its own "Department ID (optional)" field drives that instead.
    await page.goto("/analytics");
    let panel = cardByTitle(page, "Department performance");
    await applyPinnedFilters(panel, analyticsPeriod);
    await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
    await expect(page.getByRole("rowheader")).toHaveCount(1);
    // No management grant survives without a department (see below), and
    // department performance is excluded from the dropdown regardless - so
    // there is nothing left to choose from and no dropdown renders at all.
    await expect(page.getByLabel("Analytics measure")).toHaveCount(0);
    await panel
      .getByLabel("Department ID (optional)")
      .fill(fixture.departmentB);
    await panel.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      panel.getByText(/No matching data in your permitted scope/),
    ).toBeVisible();
    const denied = await page.request.get(
      endpoint("employees", {
        ...analyticsPeriod,
        employeeId: fixture.employeeId,
      }),
    );
    expect(denied.status()).toBe(403);
    await fixture.setManagerDepartment(null);
    try {
      await page.goto("/analytics");
      await expect(
        page.getByRole("heading", {
          name: "Analytics access required",
          exact: true,
        }),
      ).toBeVisible();
      await fixture.setManagerDepartment(fixture.departmentB);
      await page.goto("/analytics");
      panel = cardByTitle(page, "Department performance");
      await applyPinnedFilters(panel, analyticsPeriod);
      await workRow(page, fixture.departmentB, 0, 1, "0%", 1, 0);
      await expect(
        page.getByRole("rowheader", { name: fixture.departmentA }),
      ).toHaveCount(0);
      // Same grants, changed department: focus recheck must not resurrect A.
      await panel
        .getByLabel("Department ID (optional)")
        .fill(fixture.departmentA);
      await fixture.setManagerDepartment(fixture.departmentA);
      // Window focus only revalidates permissions once they are stale
      // (staleTime 30s); there is deliberately no background poll. Wait out
      // the stale window so the focus recheck below is a real refetch.
      await page.waitForTimeout(31_000);
      const access = page.waitForResponse(
        (response) => response.url().includes("/auth/me/permissions"),
        { timeout: 45_000 },
      );
      // The access recheck landing is not the same moment the pinned
      // department panel's own re-fetch (triggered reactively by its new
      // epoch) lands - wait for that too, or the table can still show the
      // previous department's stale response when the assertion below runs.
      const refetched = page.waitForResponse(
        (response) =>
          response.url().includes("/analytics/departments") &&
          response.status() === 200,
        { timeout: 45_000 },
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event("visibilitychange"));
      });
      // Exercise the visibility event consumed by the hook; API responses stay real.
      await access;
      await refetched;
      await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
      await expect(panel.getByLabel("Department ID (optional)")).toHaveValue(
        fixture.departmentA,
      );
      await expectNoWcag22AaViolations(page, "ANA-06 department-scoped access");
    } finally {
      await fixture.setManagerDepartment(fixture.departmentA);
    }
  });
});

test.describe("ANA-06 ordinary employee boundary", () => {
  test.use({ storageState: authStatePath("member") });
  test("all management measures are denied even for an assigned employee", async ({
    page,
  }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/analytics/")) requests++;
    });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Analytics", exact: true }),
    ).toHaveCount(0);
    await page.goto(selection("employees", fixture.employeeId));
    await expect(
      page.getByRole("alert").filter({ hasText: "Analytics access required" }),
    ).toBeVisible();
    expect(requests).toBe(0);
    for (const path of [
      "task-completion",
      "departments",
      "employees",
      "events",
      "campaigns",
      "promotion",
      "monthly-activity",
    ]) {
      const response = await page.request.get(
        endpoint(path, {
          ...analyticsPeriod,
          ...(path === "promotion" ? { campaignId: fixture.promotion } : {}),
        }),
      );
      expect(response.status()).toBe(403);
      expect(response.headers()["content-type"]).toContain(
        "application/problem+json",
      );
    }
    await page.context().clearCookies();
    expect(
      (
        await page.request.get(endpoint("task-completion", analyticsPeriod))
      ).status(),
    ).toBe(401);
    await page.goto(selection("tasks"));
    await expect(page).toHaveURL(/\/login\?next=%2Fanalytics/);
  });
});

test.describe("ANA-06 responsive and network release profiles", () => {
  test.use({
    storageState: authStatePath("manager"),
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
  });
  for (const profile of [
    {
      name: "Ethiopia mobile baseline",
      down: 1_600_000,
      up: 750_000,
      latency: 300,
      lcpLimit: 4000,
      inpLimit: 300,
    },
    {
      name: "Ethiopia mobile constrained",
      down: 400_000,
      up: 250_000,
      latency: 600,
      lcpLimit: 6000,
      inpLimit: 500,
    },
  ]) {
    test(`${profile.name}: cold page, keyboard refresh and useful recovery`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => {
        const readings = {
          lcp: 0,
          candidates: [] as {
            startTime: number;
            element: string;
            text: string;
          }[],
          interactions: [] as number[],
        };
        Object.defineProperty(window, "anaReleaseMetrics", { value: readings });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            readings.lcp = entry.startTime;
            const element = (entry as PerformanceEntry & { element?: Element })
              .element;
            readings.candidates.push({
              startTime: entry.startTime,
              element: element?.tagName ?? "",
              text: element?.textContent?.slice(0, 160) ?? "",
            });
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (
              (entry as PerformanceEntry & { interactionId: number })
                .interactionId > 0
            )
              readings.interactions.push(entry.duration);
          }
        }).observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        } as PerformanceObserverInit);
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: profile.latency,
        downloadThroughput: profile.down / 8,
        uploadThroughput: profile.up / 8,
      });
      await page.goto("/analytics");
      const tasksPanel = cardByTitle(page, "Task completion rate");
      // Sanity-check real (not blank/placeholder) data without an extra
      // interaction, which would pollute the INP sample measured below -
      // the pinned panel's own default period need not match the fixture's
      // fixed historical month for this performance-focused check.
      await expect(
        page
          .getByText("Eligible tasks", { exact: true })
          .locator("..")
          .locator("dd"),
      ).toHaveText(/^\d+$/);
      // A keyboard interaction proves refresh remains operable under the profile.
      await tasksPanel.getByRole("button", { name: "Refresh measure" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        tasksPanel.getByText(
          "Task completion rate refreshed from authoritative data.",
        ),
      ).toBeVisible();
      const readings = await page.evaluate(
        () =>
          (
            window as unknown as {
              anaReleaseMetrics: {
                lcp: number;
                candidates: {
                  startTime: number;
                  element: string;
                  text: string;
                }[];
                interactions: number[];
              };
            }
          ).anaReleaseMetrics,
      );
      // Chromium Event Timing has a 16ms observation floor. No entries means <16ms,
      // not an invented zero-duration interaction. This is a short-journey INP sample.
      const inpUpperBound = Math.max(16, ...readings.interactions);
      // Persist diagnostics even when a hard performance assertion fails.
      await testInfo.attach("analytics-mobile-profile", {
        body: JSON.stringify(
          {
            ...profile,
            viewport: "360x800 DPR2",
            cache: "disabled",
            ...readings,
            sampledInpUpperBound: inpUpperBound,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(readings.lcp).toBeGreaterThan(0);
      expect(readings.lcp, `${profile.name} LCP`).toBeLessThanOrEqual(
        profile.lcpLimit,
      );
      expect(
        inpUpperBound,
        `${profile.name} sampled INP bound`,
      ).toBeLessThanOrEqual(profile.inpLimit);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expectNoWcag22AaViolations(page, profile.name);
      await testInfo.attach("analytics-mobile-screen", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await cdp.detach();
    });
  }
  test("monthly tables reflow in light/dark and reduced-motion profiles", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/analytics");
    const monthlyPanel = cardByTitle(page, "Monthly activity");
    for (const [width, height] of [
      [360, 800],
      [768, 1024],
      [1440, 900],
      [720, 900],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      for (const dark of [false, true]) {
        await page.evaluate(
          (enabled) =>
            document.documentElement.classList.toggle("dark", enabled),
          dark,
        );
        await expect(monthlyPanel.getByRole("table")).toBeVisible();
        await expect(monthlyPanel.getByRole("figure")).toHaveCount(6);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await expectNoWcag22AaViolations(
          page,
          `monthly ${width}px ${dark ? "dark" : "light"}`,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: testInfo.outputPath(
            `analytics-monthly-${width}-${dark ? "dark" : "light"}.png`,
          ),
          fullPage: true,
        });
      }
    }
    // 720 CSS pixels models 200% desktop reflow, not manual browser/AT certification.
    const tableRegion = page.getByRole("region", {
      name: "Monthly activity — separate source counts table",
    });
    await tableRegion.focus();
    await expect(tableRegion).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  });
});
