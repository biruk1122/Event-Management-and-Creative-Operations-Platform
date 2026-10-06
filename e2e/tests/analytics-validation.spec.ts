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
    await page.goto(selection("tasks"));
    for (const [name, value] of Object.entries({
      "Eligible tasks": 3,
      Completed: 1,
      Pending: 2,
      Overdue: 1,
    }))
      await taskCount(page, name, value);
    await expect(page.getByText("33%", { exact: false }).first()).toBeVisible();
    await expect(page.locator("time")).toHaveAttribute("datetime", /T.*Z$/);
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
    await page.goto(selection("departments", fixture.departmentA));
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
    await page.goto(selection("monthly"));
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
    await page.goto(selection("departments", fixture.emptyDepartment));
    await workRow(
      page,
      fixture.emptyDepartment,
      0,
      0,
      "No eligible work",
      0,
      0,
    );
    await page.goto(selection("departments", randomUUID()));
    await expect(
      page.getByText(/No matching data in your permitted scope/),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
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
    await page.goto(
      selection("tasks", undefined, { toExclusive: "2001-10-02" }),
    );
    await taskCount(page, "Eligible tasks", 4);
    await page.goto(
      selection("monthly", undefined, {
        from: "2000-01-01",
        toExclusive: "2000-03-01",
      }),
    );
    for (const month of ["2000-01", "2000-02"])
      await expect(
        page
          .getByRole("row")
          .filter({
            has: page.getByRole("rowheader", { name: month, exact: true }),
          })
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
    await page.goto(selection("departments"));
    await expect(page.getByRole("rowheader")).toHaveText(
      first.items.map((row) => row.id),
    );
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("rowheader")).toHaveText(
      second.items.map((row) => row.id),
    );
    await page.reload();
    await expect(page.getByRole("rowheader")).toHaveText(
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
    await page.goto(selection("tasks", undefined, { from: "2001-02-30" }));
    await expect(
      page.getByRole("alert").filter({ hasText: "valid UTC dates" }),
    ).toBeVisible();
    expect(requests).toBe(0);
    await page.goto(
      selection("departments", undefined, { page: "102", pageSize: "100" }),
    );
    await expect(page.getByText(/Invalid page/)).toBeVisible();
    expect(requests).toBe(0);
  });

  test("a real source timeout shows partial failure and recovers without synthetic zeroes", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(selection("departments", fixture.departmentA));
    await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
    const db = analyticsDatabaseUrl(),
      schema = schemaOf(db);
    assertSchemaName(schema);
    const lock = new Client({ connectionString: db });
    await lock.connect();
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
      await page.getByLabel("Analytics measure").selectOption("tasks");
      const response = await failed;
      expect(await response.json()).toMatchObject({
        code: "ANALYTICS_UNAVAILABLE",
      });
      await expect(
        page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
      ).toBeVisible();
      await expect(
        page.getByText(/Successful measures remain readable/),
      ).toBeVisible();
      await expect(page.getByRole("meter")).toHaveCount(0);
      await expect(
        page.getByText("Eligible tasks", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await lock.query("ROLLBACK");
      await lock.end();
    }
    await page.getByRole("button", { name: "Try again" }).click();
    await taskCount(page, "Eligible tasks", 3);
    await expect(page.getByText(/temporarily unavailable/)).toHaveCount(0);
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
    test.setTimeout(60_000);
    await page.goto(selection("departments"));
    await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
    await expect(page.getByRole("rowheader")).toHaveCount(1);
    await expect(
      page.getByRole("option", { name: "Employee performance" }),
    ).toHaveCount(0);
    await page.goto(selection("departments", fixture.departmentB));
    await expect(
      page.getByText(/No matching data in your permitted scope/),
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
      await page.goto(selection("departments"));
      await expect(
        page.getByText(/No matching data in your permitted scope/),
      ).toBeVisible();
      await fixture.setManagerDepartment(fixture.departmentB);
      await page.goto(selection("departments"));
      await workRow(page, fixture.departmentB, 0, 1, "0%", 1, 0);
      await expect(
        page.getByRole("rowheader", { name: fixture.departmentA }),
      ).toHaveCount(0);
      // Same grants, changed department: focus recheck must not resurrect A.
      await page.getByLabel("Subject ID (optional)").fill(fixture.departmentA);
      await fixture.setManagerDepartment(fixture.departmentA);
      const access = page.waitForResponse((response) =>
        response.url().includes("/auth/me/permissions"),
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event("visibilitychange"));
      });
      // Exercise the visibility event consumed by the hook; API responses stay real.
      await access;
      await workRow(page, fixture.departmentA, 1, 2, "50%", 1, 1);
      await expect(page.getByLabel("Subject ID (optional)")).toHaveValue(
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
      await page.goto(selection("tasks"));
      await taskCount(page, "Eligible tasks", 3);
      // A keyboard interaction proves refresh remains operable under the profile.
      await page.getByRole("button", { name: "Refresh measure" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Task completion refreshed from authoritative data."),
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
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(selection("monthly"));
    for (const width of [360, 768, 1440, 720]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await page.evaluate(
          (enabled) =>
            document.documentElement.classList.toggle("dark", enabled),
          dark,
        );
        await expect(page.getByRole("table")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await expectNoWcag22AaViolations(
          page,
          `monthly ${width}px ${dark ? "dark" : "light"}`,
        );
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
