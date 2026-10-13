import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";

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
  test(`campaigns cold mobile ${profile.name} and keyboard create`, async ({
    browser,
  }, info) => {
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
        Object.defineProperty(window, "campaignMetrics", { value: metrics });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (
              (entry as PerformanceEntry & { interactionId: number })
                .interactionId > 0
            )
              metrics.interactions.push(entry.duration);
          }
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
      await page.goto("/campaigns");
      const opener = page.getByRole("button", {
        name: "New campaign",
        exact: true,
      });
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      const metrics = await page.evaluate(
        () =>
          (
            window as unknown as {
              campaignMetrics: { lcp: number; interactions: number[] };
            }
          ).campaignMetrics,
      );
      const bound = Math.max(16, ...metrics.interactions);
      await info.attach("campaigns-mobile-profile", {
        body: JSON.stringify({
          profile,
          cache: "disabled",
          viewport: "360x800 DPR2",
          ...metrics,
          sampledInteractionUpperBound: bound,
        }),
        contentType: "application/json",
      });
      expect(metrics.lcp).toBeGreaterThan(0);
      expect(metrics.lcp).toBeLessThanOrEqual(profile.lcp);
      expect(bound).toBeLessThanOrEqual(profile.interaction);
    } finally {
      await context.close();
    }
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await expectNoWcag22AaViolations(page, name);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}

for (const type of ["MARKETING", "PROMOTION"] as const) {
  test(`${type} long content, activities, plans and empty recovery reflow`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const csrf = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )!.value;
    const headers = { "x-csrf-token": csrf };
    const name = `UI11-${randomUUID()}-${"LongCampaignName".repeat(5)}`;
    const created = await page.request.post(`${apiBaseUrl}/api/v1/campaigns`, {
      headers,
      data: {
        name,
        campaignType: type,
        description: "Campaign planning across teams. ".repeat(30),
        startAt: "2050-06-01T10:00:00Z",
        endAt: "2050-06-10T10:00:00Z",
      },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const activityName = `LongActivity-${"ConnectedCreativeDelivery".repeat(5)}`;
    const activity = await page.request.post(
      `${apiBaseUrl}/api/v1/campaigns/${id}/activities`,
      {
        headers,
        data: {
          name: activityName,
          description: "Deliver connected campaign work. ".repeat(20),
          status: "PLANNED",
        },
      },
    );
    expect(activity.status()).toBe(201);
    const planButton =
      type === "MARKETING" ? "Marketing strategy" : "Promotion operations";
    await page.goto(
      type === "MARKETING" ? "/campaigns?type=MARKETING" : "/campaigns",
    );
    const search = page.getByRole("searchbox", { name: "Search", exact: true });
    await search.fill(name);
    const opener = page.getByRole("button", { name: new RegExp(name) });
    const dialog = page.getByRole("dialog");
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 720, height: 450 },
    ]) {
      await page.setViewportSize(viewport);
      for (const dark of [false, true]) {
        await page.evaluate(
          (enabled) =>
            document.documentElement.classList.toggle("dark", enabled),
          dark,
        );
        await capture(page, info, `${type}-list-${viewport.width}-${dark}`);
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(
          dialog.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText(activityName, { exact: true }),
        ).toBeVisible();
        await capture(page, info, `${type}-overview-${viewport.width}-${dark}`);
        const plan = dialog.getByRole("button", {
          name: planButton,
          exact: true,
        });
        await plan.focus();
        await page.keyboard.press("Enter");
        await expect(plan).toHaveAttribute("aria-current", "page");
        if (type === "PROMOTION") {
          await dialog
            .getByRole("button", { name: new RegExp(activityName) })
            .click();
          await expect(dialog.getByLabel("Delivery channel")).toBeVisible();
        } else {
          await expect(
            dialog.getByText("No strategy yet", { exact: true }),
          ).toBeVisible();
        }
        await capture(page, info, `${type}-plan-${viewport.width}-${dark}`);
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
      }
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await opener.click();
    await dialog.getByRole("button", { name: planButton, exact: true }).click();
    if (type === "MARKETING") {
      await dialog
        .getByRole("button", { name: "Add strategy", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Save strategy", exact: true })
        .click();
      await expect(
        dialog.getByText("Enter a strategy before saving."),
      ).toBeVisible();
      const strategy =
        "Build a clear, coordinated regional creative campaign. ".repeat(30);
      await dialog.getByLabel("Strategy", { exact: true }).fill(strategy);
      await dialog
        .getByRole("button", { name: "Save strategy", exact: true })
        .click();
      await expect(
        dialog.getByText(strategy.trim(), { exact: true }),
      ).toBeVisible();
      await capture(page, info, "marketing-long-strategy-mobile");
    } else {
      await dialog.getByLabel("Search activities").fill("absent-activity");
      await expect(
        dialog.getByText("No activities match these filters."),
      ).toBeVisible();
      await capture(page, info, "promotion-empty-mobile");
      await dialog
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: new RegExp(activityName) }),
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await search.fill("absent-campaign");
    await expect(
      page.getByText("No campaigns match these filters"),
    ).toBeVisible();
    await capture(page, info, `${type}-empty-mobile`);
    await search.fill(name);
    await expect(opener).toBeVisible();
    const create = page.getByRole("button", {
      name: "New campaign",
      exact: true,
    });
    await create.focus();
    await page.keyboard.press("Enter");
    await dialog
      .getByRole("button", { name: "Create campaign", exact: true })
      .click();
    await expect(
      dialog.getByText("Enter a name.", { exact: true }),
    ).toBeVisible();
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await capture(page, info, `${type}-create-validation-mobile`);
    await page.keyboard.press("Escape");
    await expect(create).toBeFocused();
  });
}
