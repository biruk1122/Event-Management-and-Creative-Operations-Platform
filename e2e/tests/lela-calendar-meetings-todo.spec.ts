import { departmentIdFor } from "../fixtures/test-data.js";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "csrf token should be present").toBeTruthy();
  return token as string;
}

async function roleIdByName(page: Page, name: string): Promise<string> {
  const response = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
  expect(response.ok()).toBe(true);
  const roles = (await response.json()) as { id: string; name: string }[];
  const role = roles.find((candidate) => candidate.name === name);
  expect(role, `role "${name}" should exist`).toBeTruthy();
  return role!.id;
}

/** A disposable "Department Member" account, created through the real API. Owner-
 * scoped calendar entries and to-dos must not be created under the shared
 * `superAdmin` fixture - that account's personal to-do/calendar records are
 * also read by other specs (e.g. todo.spec.ts's own "Completed" view), and a
 * loose, non-exact role lookup there previously collided with an item this
 * suite left behind. Matching calendar.spec.ts/todo.spec.ts's own disposable-
 * user convention. */
async function createDisposableUser(
  page: Page,
  csrf: string,
  label: string,
): Promise<{ email: string; id: string; firstName: string; lastName: string }> {
  const suffix = randomUUID().slice(0, 8);
  const roleId = await roleIdByName(page, "Department Member");
  const firstName = "UI10";
  const lastName = `${label} ${suffix}`;
  const email = `ui10-${label}-${suffix}@e2e.test`;
  const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": csrf },
    data: {
      email,
      firstName,
      lastName,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId,
      departmentId: await departmentIdFor(page.request),
    },
  });
  expect(created.status()).toBe(201);
  return {
    email,
    id: ((await created.json()) as { id: string }).id,
    firstName,
    lastName,
  };
}

/** A `datetime-local`/date-only value for "today", so created records always
 * fall under each screen's default view regardless of which day of the
 * month the suite happens to run on. */
function todayAt(hour: number, minute = 0): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function todayDateOnly(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test.describe("Lela calendar, meetings and to-do presentation", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  for (const profile of [
    {
      name: "baseline",
      down: 1_600_000,
      up: 750_000,
      latency: 300,
      lcp: 4000,
      interaction: 300,
    },
    {
      name: "constrained",
      down: 400_000,
      up: 250_000,
      latency: 600,
      lcp: 6000,
      interaction: 500,
    },
  ]) {
    test(`calendar cold mobile ${profile.name} and keyboard create`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(90_000);
      const context = await browser.newContext({
        storageState: authStatePath("superAdmin"),
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
      });
      try {
        const page = await context.newPage();
        await page.addInitScript(() => {
          const metrics = { lcp: 0, interactions: [] as number[] };
          Object.defineProperty(window, "workMetrics", { value: metrics });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              metrics.lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (
                (entry as PerformanceEntry & { interactionId: number })
                  .interactionId > 0
              )
                metrics.interactions.push(entry.duration);
          }).observe({
            type: "event",
            buffered: true,
            durationThreshold: 16,
          } as PerformanceObserverInit);
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: profile.latency,
          downloadThroughput: profile.down / 8,
          uploadThroughput: profile.up / 8,
        });
        await page.goto("/calendar");
        const opener = page.getByRole("button", {
          name: "Add entry",
          exact: true,
        });
        await expect(opener).toBeVisible();
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
        const metrics = await page.evaluate(
          () =>
            (
              window as unknown as {
                workMetrics: { lcp: number; interactions: number[] };
              }
            ).workMetrics,
        );
        const interactionBound = Math.max(16, ...metrics.interactions);
        await testInfo.attach("calendar-mobile-profile", {
          body: JSON.stringify({
            profile,
            cache: "disabled",
            viewport: "360x800 DPR2",
            ...metrics,
            sampledInteractionUpperBound: interactionBound,
          }),
          contentType: "application/json",
        });
        expect(metrics.lcp).toBeGreaterThan(0);
        expect(metrics.lcp).toBeLessThanOrEqual(profile.lcp);
        expect(interactionBound).toBeLessThanOrEqual(profile.interaction);
      } finally {
        await context.close();
      }
    });
  }

  test("calendar, meetings and to-do retain responsive, accessible dark/light presentation with real records", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    const csrf = await csrfToken(page);
    const owner = await createDisposableUser(page, csrf, "owner");
    // axe-core's Playwright driver requires an explicitly created context
    // (not the shorthand `browser.newPage()`), per its own error-handling
    // guidance, since this test runs `expectNoWcag22AaViolations` on it.
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    try {
      await signInThroughUi(ownerPage, {
        key: "ui10-owner",
        email: owner.email,
        password: TEST_USER_PASSWORD,
        role: "Department Member",
        firstName: owner.firstName,
        lastName: owner.lastName,
      });
      await ownerPage.emulateMedia({ reducedMotion: "reduce" });
      const ownerCsrf = await csrfToken(ownerPage);
      const ownerHeaders = { "x-csrf-token": ownerCsrf };

      const entryTitle = `UI10-calendar-${randomUUID()}`;
      const entryCreated = await ownerPage.request.post(
        `${apiBaseUrl}/api/v1/calendar`,
        {
          headers: ownerHeaders,
          data: {
            title: entryTitle,
            type: "PERSONAL",
            startAt: todayAt(9, 0),
          },
        },
      );
      expect(entryCreated.status()).toBe(201);

      const todoTitle = `UI10-todo-${randomUUID()}`;
      const todoCreated = await ownerPage.request.post(
        `${apiBaseUrl}/api/v1/todos`,
        {
          headers: ownerHeaders,
          data: { title: todoTitle, dueDate: todayDateOnly() },
        },
      );
      expect(todoCreated.status()).toBe(201);

      // The organizer (superAdmin) invites the disposable owner, who then
      // views the real invitation on their own `/meetings` - matching
      // meetings.spec.ts's own organizer/participant split.
      const meetingTitle = `UI10-meeting-${randomUUID()}`;
      const meetingCreated = await page.request.post(
        `${apiBaseUrl}/api/v1/meetings`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            title: meetingTitle,
            type: "ONLINE",
            startAt: new Date(Date.now() + 86_400_000).toISOString(),
            endAt: new Date(Date.now() + 90_000_000).toISOString(),
            onlineLink: "https://meet.example.test/ui10",
            participantIds: [owner.id],
          },
        },
      );
      expect(meetingCreated.status()).toBe(201);

      const routes = [
        { path: "/calendar", heading: "Calendar", record: entryTitle },
        { path: "/meetings", heading: "Meetings", record: meetingTitle },
        { path: "/todos", heading: "To-Do", record: todoTitle },
      ];

      for (const route of routes) {
        await ownerPage.goto(route.path);
        await expect(
          ownerPage.getByRole("heading", { level: 1, name: route.heading }),
        ).toBeVisible();
        await expect(
          ownerPage.getByText(route.record, { exact: true }).first(),
        ).toBeVisible();
        for (const viewport of [
          { width: 360, height: 800 },
          { width: 768, height: 1024 },
          { width: 1440, height: 900 },
          { width: 720, height: 450 },
        ]) {
          await ownerPage.setViewportSize(viewport);
          for (const dark of [false, true]) {
            await ownerPage.evaluate(
              (value) =>
                document.documentElement.classList.toggle("dark", value),
              dark,
            );
            expect(
              await ownerPage.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await expectNoWcag22AaViolations(
              ownerPage,
              `${route.path} ${viewport.width} ${dark}`,
            );
            await ownerPage.screenshot({
              path: testInfo.outputPath(
                `${route.path.slice(1)}-${viewport.width}-${dark}.png`,
              ),
              fullPage: true,
            });
          }
        }
        await ownerPage.setViewportSize({ width: 360, height: 800 });
      }

      // Keyboard entry and focus restoration through the calendar create dialog.
      await ownerPage.goto("/calendar");
      const addEntry = ownerPage.getByRole("button", {
        name: "Add entry",
        exact: true,
      });
      await addEntry.focus();
      await ownerPage.keyboard.press("Enter");
      const calendarDialog = ownerPage.getByRole("dialog");
      await expect(calendarDialog).toBeVisible();
      for (let index = 0; index < 6; index++) {
        await ownerPage.keyboard.press("Tab");
        expect(
          await calendarDialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      await expectNoWcag22AaViolations(
        ownerPage,
        "Calendar create mobile dark",
      );
      await ownerPage.keyboard.press("Escape");
      await expect(addEntry).toBeFocused();

      // The to-do completion toggle is a real PATCH, reflected after reload.
      await ownerPage.goto("/todos");
      await ownerPage
        .getByRole("button", { name: `Mark "${todoTitle}" as completed` })
        .click();
      await ownerPage.reload();
      await ownerPage.getByRole("button", { name: "Completed" }).click();
      await expect(
        ownerPage.getByText(todoTitle, { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(
        ownerPage,
        "To-do completed view mobile dark",
      );

      // The meeting detail panel keeps the invited participant's own record.
      await ownerPage.goto("/meetings");
      await expect(
        ownerPage.getByRole("heading", { name: meetingTitle, exact: true }),
      ).toBeVisible();
      await expect(
        ownerPage.getByText("Pending", { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(ownerPage, "Meeting detail mobile dark");
    } finally {
      await ownerContext.close();
    }
  });
});
