import { expect, test } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureEmail, fixtureName } from "../fixtures/test-data.js";

const areas = [
  { route: "/users", title: "Users", action: "New user", endpoint: "users" },
  {
    route: "/settings/roles",
    title: "Roles and permissions",
    action: "New role",
    endpoint: "roles",
  },
  {
    route: "/departments",
    title: "Departments",
    action: "New department",
    endpoint: "departments",
  },
  { route: "/teams", title: "Teams", action: "New team", endpoint: "teams" },
] as const;

test.describe("Lela administration presentation", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  for (const profile of [
    {
      name: "baseline",
      down: 1_600_000,
      up: 750_000,
      latency: 300,
      lcpLimit: 4000,
      interactionLimit: 300,
    },
    {
      name: "constrained",
      down: 400_000,
      up: 250_000,
      latency: 600,
      lcpLimit: 6000,
      interactionLimit: 500,
    },
  ]) {
    test(`Users: Ethiopian mobile ${profile.name} cold navigation and keyboard create`, async ({
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
          Object.defineProperty(window, "adminMetrics", { value: metrics });
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
        await page.goto("/users");
        const opener = page.getByRole("button", {
          name: "New user",
          exact: true,
        });
        await expect(opener).toBeVisible();
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(
          page.getByRole("dialog").getByLabel("First name"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
        const metrics = await page.evaluate(
          () =>
            (
              window as unknown as {
                adminMetrics: { lcp: number; interactions: number[] };
              }
            ).adminMetrics,
        );
        const interactionBound = Math.max(16, ...metrics.interactions);
        await testInfo.attach("administration-mobile-profile", {
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
        expect(metrics.lcp).toBeLessThanOrEqual(profile.lcpLimit);
        expect(interactionBound).toBeLessThanOrEqual(profile.interactionLimit);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      } finally {
        await context.close();
      }
    });
  }

  for (const area of areas) {
    test(`${area.title}: real records, responsive themes and dialog keyboard focus`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const csrf = (await page.context().cookies()).find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      expect(csrf).toBeTruthy();
      const headers = { "x-csrf-token": csrf! };
      const name = fixtureName("UI08-long-administration-record");
      let departmentId: string | undefined;
      if (area.endpoint === "teams") {
        const department = await page.request.post(
          `${apiBaseUrl}/api/v1/departments`,
          { headers, data: { name: fixtureName("UI08-owning-department") } },
        );
        expect(department.status()).toBe(201);
        departmentId = ((await department.json()) as { id: string }).id;
      }
      const created = await page.request.post(
        `${apiBaseUrl}/api/v1/${area.endpoint}`,
        {
          headers,
          data:
            area.endpoint === "users"
              ? {
                  firstName: name,
                  lastName: "LongNameWithoutSpacesForReflow",
                  email: fixtureEmail("ui08"),
                  temporaryPassword: "e2e-Passw0rd!",
                }
              : {
                  name,
                  description:
                    "Authoritative UI-08 fixture with readable detail and filter context.",
                  ...(departmentId ? { departmentId } : {}),
                },
        },
      );
      expect(created.status()).toBe(201);
      const record = (await created.json()) as { id: string };
      try {
        await page.goto(area.route);
        await expect(
          page.getByRole("heading", { level: 1, name: area.title }),
        ).toBeVisible();
        await page
          .getByLabel(area.endpoint === "roles" ? "Search roles" : "Search", {
            exact: true,
          })
          .fill(name);
        const row = page.getByRole("button", { name: new RegExp(name) });
        await expect(row).toBeVisible();

        for (const viewport of [
          { width: 360, height: 800 },
          { width: 768, height: 1024 },
          { width: 1440, height: 900 },
          { width: 720, height: 450 },
        ]) {
          await page.setViewportSize(viewport);
          for (const theme of ["light", "dark"]) {
            await page.evaluate(
              (dark) => document.documentElement.classList.toggle("dark", dark),
              theme === "dark",
            );
            await expect(row).toBeVisible();
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await expectNoWcag22AaViolations(
              page,
              `${area.title} ${viewport.width} ${theme}`,
            );
            await page.screenshot({
              path: testInfo.outputPath(
                `${area.endpoint}-${viewport.width}-${theme}.png`,
              ),
              fullPage: true,
            });
          }
        }

        await page.setViewportSize({ width: 360, height: 800 });
        await row.focus();
        await page.keyboard.press("Enter");
        const detail = page.getByRole("dialog");
        await expect(
          detail.getByRole("heading", { name: new RegExp(name) }),
        ).toBeVisible();
        await expectNoWcag22AaViolations(
          page,
          `${area.title} detail mobile dark`,
        );
        expect(
          await detail.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${area.endpoint}-detail-mobile-dark.png`),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await expect(detail).toHaveCount(0);
        await expect(row).toBeFocused();

        const createButton = page.getByRole("button", {
          name: area.action,
          exact: true,
        });
        await createButton.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("heading", { name: area.action }),
        ).toBeVisible();
        for (let index = 0; index < 12; index++) {
          await page.keyboard.press("Tab");
          expect(
            await dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          ).toBe(true);
        }
        await expectNoWcag22AaViolations(
          page,
          `${area.title} create mobile dark`,
        );
        expect(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${area.endpoint}-create-mobile-dark.png`),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(createButton).toBeFocused();
      } finally {
        // No roles remain to disturb the established five-role fixture journey.
        if (area.endpoint !== "users") {
          const removed = await page.request.delete(
            `${apiBaseUrl}/api/v1/${area.endpoint}/${record.id}`,
            { headers },
          );
          expect(removed.ok()).toBe(true);
        }
        if (departmentId) {
          const removed = await page.request.delete(
            `${apiBaseUrl}/api/v1/departments/${departmentId}`,
            { headers },
          );
          expect(removed.ok()).toBe(true);
        }
      }
    });
  }
});
