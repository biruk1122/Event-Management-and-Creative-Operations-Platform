import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";
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
  test(`Discuss cold mobile ${profile.name} and keyboard create`, async ({
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
        Object.defineProperty(window, "discussMetrics", { value: metrics });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
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
      await page.goto("/discuss/dm");
      const opener = page.getByRole("button", {
        name: "New conversation",
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
              discussMetrics: { lcp: number; interactions: number[] };
            }
          ).discussMetrics,
      );
      const bound = Math.max(16, ...metrics.interactions);
      await info.attach("discuss-mobile-profile", {
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
  await expectNoWcag22AaViolations(page, name);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}

for (const kind of ["DIRECT", "CHANNEL"] as const) {
  test(`${kind} two-account delivery, responsive messages and notification reconnect`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const suffix = randomUUID().slice(0, 8);
    const email = `ui12-${suffix}@e2e.test`;
    const csrf = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )!.value;
    const headers = { "x-csrf-token": csrf };
    const roles = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
    const role = ((await roles.json()) as { id: string; name: string }[]).find(
      (item) => item.name === "Team Member",
    )!;
    const user = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
      headers,
      data: {
        email,
        firstName: "Communication",
        lastName: suffix,
        temporaryPassword: TEST_USER_PASSWORD,
        roleId: role.id,
      },
    });
    expect(user.status()).toBe(201);
    const { id: userId } = (await user.json()) as { id: string };
    const created = await page.request.post(
      `${apiBaseUrl}/api/v1/conversations${kind === "CHANNEL" ? "/channels" : ""}`,
      {
        headers,
        data:
          kind === "CHANNEL"
            ? {
                name: `UI12-${suffix}-${"LongChannelName".repeat(5)}`,
                visibility: "PRIVATE",
              }
            : { type: "DIRECT", memberIds: [userId] },
      },
    );
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    if (kind === "CHANNEL") {
      const added = await page.request.put(
        `${apiBaseUrl}/api/v1/conversations/${id}/members/${userId}`,
        { headers },
      );
      expect(added.ok()).toBe(true);
    }
    const route = `/discuss/${kind === "DIRECT" ? "dm" : "channels"}/${id}`;
    const recipientContext = await browser.newContext();
    const recipient = await recipientContext.newPage();
    try {
      await signInThroughUi(recipient, {
        key: suffix,
        email,
        password: TEST_USER_PASSWORD,
        role: "Team Member",
        firstName: "Communication",
        lastName: suffix,
      });
      await recipient.goto("/notifications");
      await expect(
        recipient.getByText("You have no notifications.", { exact: true }),
      ).toBeVisible();
      await page.goto(route);
      const composer = page.getByRole("form", { name: "Send a message" });
      const content = `UI12-${suffix}-${"LongCreativeMessage".repeat(35)}`;
      await composer.getByLabel("Message", { exact: true }).fill(content);
      await composer.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        page
          .getByRole("list", { name: "Messages", exact: true })
          .getByText(content, { exact: true }),
      ).toBeVisible();
      const feed = recipient.getByRole("list", { name: "Notification feed" });
      await expect(feed.getByRole("listitem").first()).toBeVisible({
        timeout: 20_000,
      });
      await recipient.goto(route);
      await expect(
        recipient
          .getByRole("list", { name: "Messages", exact: true })
          .getByText(content, { exact: true }),
      ).toBeVisible();
      const reply = `Reply from recipient ${suffix}`;
      await recipient.getByLabel("Message", { exact: true }).fill(reply);
      await recipient
        .getByRole("button", { name: "Send", exact: true })
        .click();
      await page.reload();
      await expect(page.getByText(reply, { exact: true })).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
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
          await capture(
            page,
            info,
            `${kind}-messages-${viewport.width}-${dark}`,
          );
        }
      }
      await page.setViewportSize({ width: 360, height: 800 });
      const back = page.getByRole("button", { name: "Back", exact: true });
      await back.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("list", {
          name: kind === "DIRECT" ? "Conversations" : "Channels",
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, info, `${kind}-list-mobile`);
      const create = page.getByRole("button", {
        name: kind === "DIRECT" ? "New conversation" : "New channel",
        exact: true,
      });
      await create.focus();
      await page.keyboard.press("Enter");
      await capture(page, info, `${kind}-create-mobile`);
      await page.keyboard.press("Escape");
      await expect(create).toBeFocused();
      await recipient.goto("/notifications");
      await recipient.setViewportSize({ width: 360, height: 800 });
      await recipient.emulateMedia({ reducedMotion: "reduce" });
      await capture(recipient, info, `${kind}-notifications-mobile`);
      const existingCount = await feed.getByRole("listitem").count();
      await recipientContext.setOffline(true);
      await expect(
        recipient.getByText("Reconnecting to live updates", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      const offlineMessage = await page.request.post(
        `${apiBaseUrl}/api/v1/conversations/${id}/messages`,
        { headers, data: { content: `While disconnected ${suffix}` } },
      );
      expect(offlineMessage.status()).toBe(201);
      await recipientContext.setOffline(false);
      await expect(feed.getByRole("listitem")).toHaveCount(existingCount + 1, {
        timeout: 20_000,
      });
      const bell = recipient.getByRole("button", {
        name: "Open notifications",
        exact: true,
      });
      await bell.focus();
      await recipient.keyboard.press("Enter");
      await expect(recipient.getByRole("dialog")).toBeVisible();
      await capture(recipient, info, `${kind}-notification-panel-mobile`);
      await recipient.keyboard.press("Escape");
      await expect(bell).toBeFocused();
    } finally {
      await recipientContext.close();
    }
  });
}
