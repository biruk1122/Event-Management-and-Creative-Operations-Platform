import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type { components } from "../../packages/api-client/src/index.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { testUser } from "../fixtures/test-users.js";
import { apiBaseUrl, repositoryRoot } from "../fixtures/environment.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import {
  assertSchemaName,
  schemaOf,
  countAppliedMigrations,
  queryInSchema,
} from "../fixtures/database.js";
import {
  analyticsDatabaseUrl,
  analyticsPeriod,
  seedAnalyticsFixture,
} from "../fixtures/analytics.js";

type Schemas = components["schemas"];
let fixture: Awaited<ReturnType<typeof seedAnalyticsFixture>>;
const day = "2001-09-15";
const calendarIds = Array.from({ length: 4 }, () => randomUUID());
const todoIds = Array.from({ length: 12 }, () => randomUUID());
const prefix = `DSH-06 ${randomUUID()}`;
const conversationId = randomUUID();
test.beforeAll(async () => {
  fixture = await seedAnalyticsFixture();
  const db = analyticsDatabaseUrl();
  await queryInSchema(
    db,
    "INSERT INTO conversations (id,type,name,visibility) VALUES ($1,'CHANNEL',$2,'PRIVATE')",
    [conversationId, prefix],
  );
  await queryInSchema(
    db,
    "INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3)",
    [conversationId, fixture.employeeId, fixture.managerId],
  );
  await queryInSchema(
    db,
    "INSERT INTO messages (conversation_id,author_id,content) VALUES ($1,$2,$3)",
    [conversationId, fixture.managerId, `${prefix} secret body`],
  );
  // Historical rows cannot depend on the wall clock or the suite's other writes.
  for (const [index, id] of calendarIds.entries())
    await queryInSchema(
      db,
      "INSERT INTO calendar_entries (id,user_id,title,type,start_at) VALUES ($1,$2,$3,'PERSONAL',$4)",
      [
        id,
        index === 3 ? fixture.managerId : fixture.employeeId,
        `${prefix} calendar ${index}`,
        [
          "2001-09-15T00:00:00Z",
          "2001-09-15T23:59:59.999Z",
          "2001-09-16T00:00:00Z",
          "2001-09-15T12:00:00Z",
        ][index],
      ],
    );
  for (const [index, id] of todoIds.entries())
    await queryInSchema(
      db,
      "INSERT INTO todos (id,user_id,title,due_date,due_time) VALUES ($1,$2,$3,$4,$5)",
      [
        id,
        index === 11 ? fixture.managerId : fixture.employeeId,
        `${prefix} todo ${index}`,
        day,
        index === 0 ? "09:30:00" : null,
      ],
    );
});
test.afterAll(async () => {
  if (!fixture) return;
  const db = analyticsDatabaseUrl();
  await queryInSchema(db, "DELETE FROM conversations WHERE id=$1", [
    conversationId,
  ]);
  await queryInSchema(
    db,
    "DELETE FROM calendar_entries WHERE id = ANY($1::uuid[])",
    [calendarIds],
  );
  await queryInSchema(db, "DELETE FROM todos WHERE id = ANY($1::uuid[])", [
    todoIds,
  ]);
  await fixture.cleanup();
});
function selection(extra: Record<string, string> = {}) {
  return `/dashboard?${new URLSearchParams({ day, ...analyticsPeriod, ...extra })}`;
}
async function read(
  page: Page,
  audience: string,
  query: Record<string, string> = {},
) {
  const response = await page.request.get(
    `${apiBaseUrl}/api/v1/dashboards/${audience}?${new URLSearchParams(query)}`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return (await response.json()) as Schemas["DashboardResponse"];
}
async function login(page: Page, key: string) {
  await signInThroughUi(page, testUser(key));
}

test.describe("DSH-06 management validation", () => {
  test.use({ storageState: authStatePath("manager") });
  test("overview values match database facts rather than another UI response", async ({
    page,
  }) => {
    await login(page, "superAdmin");
    const data = await read(page, "management");
    const [facts] = await queryInSchema(
      analyticsDatabaseUrl(),
      `SELECT
      (SELECT count(*)::int FROM events) AS "totalEvents",
      (SELECT count(*)::int FROM projects WHERE status='ACTIVE') AS "activeProjects",
      (SELECT count(*)::int FROM campaigns WHERE status='ACTIVE') AS "activeCampaigns",
      (SELECT count(*)::int FROM tasks WHERE status IN ('TODO','IN_PROGRESS','UNDER_REVIEW','BLOCKED')) AS "pendingTasks",
      (SELECT count(*)::int FROM tasks WHERE status='COMPLETED') AS "completedTasks",
      (SELECT count(*)::int FROM users WHERE status='ACTIVE') AS "activeEmployees",
      (SELECT count(*)::int FROM talents WHERE availability <> 'INACTIVE') AS "activeTalents"`,
    );
    await page.goto(selection());
    const labels: Record<string, string> = {
      totalEvents: "Total events",
      activeProjects: "Active projects",
      activeCampaigns: "Active campaigns",
      pendingTasks: "Pending tasks",
      completedTasks: "Completed tasks",
      activeEmployees: "Active employees",
      activeTalents: "Active talents",
    };
    for (const [key, value] of Object.entries(facts!)) {
      expect(data.cards[key]!.data).toEqual({ count: value });
      await expect(
        page
          .getByRole("article", { name: labels[key]!, exact: true })
          .getByText(String(value), { exact: true }),
      ).toBeVisible();
    }
    expect(Object.keys(data.cards)).toHaveLength(23);
  });
  test("cohort boundaries, selected promotion and empty rates match known facts", async ({
    page,
  }) => {
    await login(page, "manager");
    const data = await read(page, "management", {
      ...analyticsPeriod,
      promotionCampaignId: fixture.promotion,
    });
    expect(data.cards.taskCompletionRate!.data).toMatchObject({
      counts: { completed: 1, total: 3, pending: 2, overdue: 1, percent: 33 },
    });
    expect(data.cards.promotionPerformance!.data).toMatchObject({
      items: [
        { channel: "RADIO_PROMOTION", completed: 1, total: 2, percent: 50 },
      ],
    });
    await page.goto(selection({ promotionCampaignId: fixture.promotion }));
    const tasks = page.getByRole("article", {
      name: "Task completion rate",
      exact: true,
    });
    await expect(
      tasks.getByText("33%", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "Promotion performance", exact: true })
        .getByRole("rowheader", { name: "radio promotion" }),
    ).toBeVisible();
    const extended = await read(page, "management", {
      ...analyticsPeriod,
      toExclusive: "2001-10-02",
      cards: "taskCompletionRate",
    });
    expect(extended.cards.taskCompletionRate!.data).toMatchObject({
      counts: { completed: 2, total: 4, percent: 50 },
    });
    const empty = await read(page, "management", {
      from: "2000-01-01",
      toExclusive: "2000-02-01",
      cards: "taskCompletionRate,promotionPerformance",
    });
    expect(empty.cards.taskCompletionRate!.data).toMatchObject({
      counts: { total: 0, percent: null },
    });
    expect(empty.cards.promotionPerformance).toEqual({
      state: "selectionRequired",
    });
    await page.goto(
      selection({ from: "2000-01-01", toExclusive: "2000-02-01" }),
    );
    await expect(
      tasks.getByText(/No eligible tasks in this creation period/),
    ).toBeVisible();
    await expect(tasks.getByRole("meter")).toHaveCount(0);
    await expect(
      page.getByText("Choose a promotion campaign above to see results."),
    ).toBeVisible();
    await expectNoWcag22AaViolations(page, "dashboard empty analytics");
  });
  test("network interruption labels original results stale and keyboard retry recovers", async ({
    page,
  }) => {
    await login(page, "manager");
    await page.goto(selection());
    const card = page.getByRole("article", {
      name: "Task completion rate",
      exact: true,
    });
    await expect(card.getByText("33%", { exact: false }).first()).toBeVisible();
    const timestamp = await card
      .locator("time")
      .first()
      .getAttribute("datetime");
    await page.route("**/api/v1/dashboards/management?*", (route) =>
      route.abort("failed"),
    );
    const refresh = page.getByRole("button", {
      name: "Refresh dashboard",
      exact: true,
    });
    await refresh.focus();
    await page.keyboard.press("Enter");
    await expect(
      card.getByText(/Stale: last successful results/),
    ).toBeVisible();
    expect(await card.locator("time").first().getAttribute("datetime")).toBe(
      timestamp,
    );
    await expect(refresh).toBeFocused();
    await page.unroute("**/api/v1/dashboards/management?*");
    await refresh.click();
    await expect(
      page.getByText("Dashboard refreshed from authoritative data."),
    ).toBeVisible();
    await expect(card.getByText(/Stale:/)).toHaveCount(0);
    await expectNoWcag22AaViolations(page, "dashboard recovered");
  });
  test("invalid URL does not fetch; API rejects identity and oversized bounds", async ({
    page,
  }) => {
    await login(page, "manager");
    let reads = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/dashboards/")) reads++;
    });
    await page.goto("/dashboard?limit=11");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    expect(reads).toBe(0);
    for (const query of [
      "limit=11",
      "months=13",
      "userId=" + fixture.employeeId,
      "from=2001-02-30&toExclusive=2001-03-01",
      "cards=totalEvents,totalEvents",
    ])
      expect(
        (
          await page.request.get(
            `${apiBaseUrl}/api/v1/dashboards/management?${query}`,
          )
        ).status(),
      ).toBe(400);
  });
  test("real statement timeout isolates failed sources and retry restores them", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page, "manager");
    await page.goto(selection());
    const card = page.getByRole("article", {
      name: "Task completion rate",
      exact: true,
    });
    await expect(card.getByText("33%", { exact: false }).first()).toBeVisible();
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
          response.url().includes("/api/v1/dashboards/management?") &&
          response.status() === 200,
      );
      await page
        .getByRole("button", { name: "Refresh dashboard", exact: true })
        .click();
      const data = (await (
        await failed
      ).json()) as Schemas["DashboardResponse"];
      expect(data.partial).toBe(true);
      expect(data.cards.taskCompletionRate!.state).toBe("unavailable");
      expect(data.cards.totalEvents!.state).toBe("ready");
      await expect(
        card.getByText("This card is unavailable. Other cards remain usable."),
      ).toBeVisible();
      await expect(card.getByRole("meter")).toHaveCount(0);
      await expect(
        page.getByRole("article", { name: "Total events", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Dashboard refreshed with partial source failures."),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "dashboard real partial failure");
    } finally {
      await lock.query("ROLLBACK");
      await lock.end();
    }
    await card
      .getByRole("button", { name: "Retry task completion rate" })
      .click();
    await expect(card.getByText("33%", { exact: false }).first()).toBeVisible();
  });
});

test.describe("DSH-06 personal and access boundaries", () => {
  test.use({ storageState: authStatePath("member") });
  test("unread counts preserve the cursor, omit message bodies and disappear after membership revocation", async ({
    page,
  }) => {
    await login(page, "member");
    const first = await read(page, "employee", { cards: "myUnreadMessages" });
    expect(first.cards.myUnreadMessages!.data).toMatchObject({
      items: expect.arrayContaining([{ conversationId, count: 1 }]),
    });
    await page.goto(`/dashboard?day=${day}`);
    const card = page.getByRole("article", {
      name: "My unread messages",
      exact: true,
    });
    await expect(
      card.getByText(`Conversation ${conversationId}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${prefix} secret body`, { exact: true }),
    ).toHaveCount(0);
    const [cursor] = await queryInSchema(
      analyticsDatabaseUrl(),
      "SELECT last_read_message_id,last_read_at FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
      [conversationId, fixture.employeeId],
    );
    expect(cursor).toEqual({ last_read_message_id: null, last_read_at: null });
    try {
      await queryInSchema(
        analyticsDatabaseUrl(),
        "DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
        [conversationId, fixture.employeeId],
      );
      await page
        .getByRole("button", { name: "Refresh dashboard", exact: true })
        .click();
      await expect(
        card.getByText(`Conversation ${conversationId}`, { exact: true }),
      ).toHaveCount(0);
      const after = await read(page, "employee", { cards: "myUnreadMessages" });
      expect(JSON.stringify(after)).not.toContain(conversationId);
    } finally {
      await queryInSchema(
        analyticsDatabaseUrl(),
        "INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [conversationId, fixture.employeeId],
      );
    }
  });
  test("self-owned schedule uses UTC half-open boundaries and To-Do stays bounded and floating", async ({
    page,
  }) => {
    await login(page, "member");
    const data = await read(page, "employee", {
      day,
      limit: "10",
      cards: "todaySchedule,myTodo",
    });
    const schedule = data.cards.todaySchedule!.data as Schemas["DashboardList"];
    expect(
      schedule.items
        .filter((item) => item.title.startsWith(prefix))
        .map((item) => item.id),
    ).toEqual(calendarIds.slice(0, 2));
    const todos = data.cards.myTodo!.data as Schemas["DashboardList"];
    expect(todos.items).toHaveLength(10);
    expect(todos.hasMore).toBe(true);
    expect(todos.items.some((item) => item.id === todoIds[11])).toBe(false);
    await page.goto(`/dashboard?day=${day}&limit=10`);
    const scheduleCard = page.getByRole("article", {
      name: "Today's schedule",
      exact: true,
    });
    for (const index of [0, 1])
      await expect(
        scheduleCard.getByText(`${prefix} calendar ${index}`, { exact: true }),
      ).toBeVisible();
    for (const index of [2, 3])
      await expect(
        scheduleCard.getByText(`${prefix} calendar ${index}`, { exact: true }),
      ).toHaveCount(0);
    const todoCard = page.getByRole("article", {
      name: "My To-Do",
      exact: true,
    });
    await expect(
      todoCard.getByText(/floating date\/time; no timezone/).first(),
    ).toBeVisible();
    await expect(
      todoCard.getByText("More items available in the source workspace."),
    ).toBeVisible();
    await expect(
      page.getByText(`${prefix} todo 11`, { exact: true }),
    ).toHaveCount(0);
    await expectNoWcag22AaViolations(page, "bounded personal dashboard");
    expect(
      (
        await page.request.get(`${apiBaseUrl}/api/v1/dashboards/management`)
      ).status(),
    ).toBe(403);
    await page.context().clearCookies();
    expect(
      (
        await page.request.get(`${apiBaseUrl}/api/v1/dashboards/employee`)
      ).status(),
    ).toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText(`${prefix} calendar 0`, { exact: true }),
    ).toHaveCount(0);
  });
  test("account switch and assignment removal cannot reuse the previous personal data", async ({
    page,
  }) => {
    await login(page, "member");
    await page.goto(`/dashboard?day=${day}`);
    await expect(
      page.getByText(`${prefix} calendar 0`, { exact: true }),
    ).toBeVisible();
    await page.context().clearCookies();
    await login(page, "deptManager");
    await page.goto(`/dashboard?audience=employee&day=${day}`);
    await expect(
      page.getByText(`${prefix} calendar 3`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${prefix} calendar 0`, { exact: true }),
    ).toHaveCount(0);
    const before = await read(page, "employee", {
      cards: "myTasks",
      limit: "10",
    });
    const items = (before.cards.myTasks!.data as Schemas["DashboardList"])
      .items;
    const assigned = items.find((item) => item.title === "ANA-06 task");
    expect(assigned).toBeDefined();
    try {
      await queryInSchema(
        analyticsDatabaseUrl(),
        "DELETE FROM task_assignments WHERE task_id=$1 AND user_id=$2",
        [assigned!.id, fixture.managerId],
      );
      await page.evaluate(() =>
        window.dispatchEvent(new Event("visibilitychange")),
      );
      await expect
        .poll(async () => {
          const current = await read(page, "employee", {
            cards: "myTasks",
            limit: "10",
          });
          return (
            current.cards.myTasks!.data as Schemas["DashboardList"]
          ).items.some((item) => item.id === assigned!.id);
        })
        .toBe(false);
      await page
        .getByRole("button", { name: "Refresh dashboard", exact: true })
        .click();
      await expect(
        page
          .getByRole("article", { name: "My tasks", exact: true })
          .getByText("ANA-06 task", { exact: true }),
      ).toHaveCount(
        items.filter((item) => item.title === "ANA-06 task").length - 1,
      );
    } finally {
      await queryInSchema(
        analyticsDatabaseUrl(),
        "INSERT INTO task_assignments (task_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [assigned!.id, fixture.managerId],
      );
    }
  });
});

test.describe("DSH-06 quality gates", () => {
  test.use({ storageState: authStatePath("manager") });
  test("all migrations apply and both audience warm p95 budgets hold", async ({
    page,
  }, testInfo) => {
    await login(page, "manager");
    const migrations = readdirSync(
      `${repositoryRoot}/apps/api/prisma/migrations`,
      { withFileTypes: true },
    ).filter((entry) => entry.isDirectory()).length;
    expect(await countAppliedMigrations(analyticsDatabaseUrl())).toBe(
      migrations,
    );
    for (const audience of ["management", "employee"]) {
      const query =
        audience === "management"
          ? {
              ...analyticsPeriod,
              months: "12",
              promotionCampaignId: fixture.promotion,
              limit: "10",
            }
          : { limit: "10" };
      await read(page, audience, query);
      const samples: number[] = [];
      for (let index = 0; index < 20; index++) {
        const start = performance.now();
        const data = await read(page, audience, query);
        samples.push(performance.now() - start);
        expect(data.partial).toBe(false);
      }
      const p95 = [...samples].sort((a, b) => a - b)[18]!;
      await testInfo.attach(`${audience}-warm-latency`, {
        body: JSON.stringify({ samples, p95, budget: 750 }),
        contentType: "application/json",
      });
      expect(p95).toBeLessThanOrEqual(750);
    }
  });
  test("dashboard reflows in light/dark and reduced-motion profiles", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await login(page, "manager");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(selection());
    await expect(
      page
        .getByRole("article", { name: "Task completion rate", exact: true })
        .getByText("33%", { exact: false })
        .first(),
    ).toBeVisible();
    for (const width of [360, 768, 1440, 720]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await page.evaluate(
          (enabled) =>
            document.documentElement.classList.toggle("dark", enabled),
          dark,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expectNoWcag22AaViolations(
          page,
          `dashboard ${width} ${dark ? "dark" : "light"}`,
        );
      }
    }
    await testInfo.attach("dashboard-reflow", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});

test.describe("DSH-06 Ethiopian-network profiles", () => {
  test.use({
    storageState: authStatePath("manager"),
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
  });
  for (const profile of [
    {
      name: "baseline",
      down: 1_600_000,
      up: 750_000,
      latency: 300,
      lcpLimit: 4000,
      inpLimit: 300,
    },
    {
      name: "constrained",
      down: 400_000,
      up: 250_000,
      latency: 600,
      lcpLimit: 6000,
      inpLimit: 500,
    },
  ]) {
    test(`${profile.name}: cold dashboard and keyboard refresh meet hard budgets`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await login(page, "manager");
      await page.addInitScript(() => {
        const readings = { lcp: 0, interactions: [] as number[] };
        Object.defineProperty(window, "dashboardReleaseMetrics", {
          value: readings,
        });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) readings.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (
              (entry as PerformanceEntry & { interactionId: number })
                .interactionId > 0
            )
              readings.interactions.push(entry.duration);
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
      await page.goto(selection());
      await expect(
        page
          .getByRole("article", { name: "Task completion rate", exact: true })
          .getByText("33%", { exact: false })
          .first(),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Refresh dashboard", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Dashboard refreshed from authoritative data."),
      ).toBeVisible();
      const readings = await page.evaluate(
        () =>
          (
            window as unknown as {
              dashboardReleaseMetrics: { lcp: number; interactions: number[] };
            }
          ).dashboardReleaseMetrics,
      );
      // Event Timing's floor is 16ms; this is a short-journey sample, not field INP.
      const sampledInpUpperBound = Math.max(16, ...readings.interactions);
      await testInfo.attach(`dashboard-${profile.name}-metrics`, {
        body: JSON.stringify({
          ...profile,
          ...readings,
          sampledInpUpperBound,
          viewport: "360x800 DPR2",
          cache: "disabled",
        }),
        contentType: "application/json",
      });
      expect(readings.lcp).toBeGreaterThan(0);
      expect(readings.lcp).toBeLessThanOrEqual(profile.lcpLimit);
      expect(sampledInpUpperBound).toBeLessThanOrEqual(profile.inpLimit);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expectNoWcag22AaViolations(
        page,
        `dashboard mobile ${profile.name}`,
      );
      await testInfo.attach(`dashboard-${profile.name}-screen`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await cdp.detach();
    });
  }
});
