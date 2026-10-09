import { expect, test } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl, webBaseUrl } from "../fixtures/environment.js";
import { testUser } from "../fixtures/test-users.js";

test.use({ storageState: { cookies: [], origins: [] } });

test("responsive Lela login remains accessible in light/dark and reflow", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in | Lela Creative Management");
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 720, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    for (const dark of [false, true]) {
      await page.evaluate(
        (enabled) => document.documentElement.classList.toggle("dark", enabled),
        dark,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Welcome back" }),
      ).toBeVisible();
      await expect(
        page.getByRole("img", { name: "Lela Creative Management" }),
      ).toBeVisible();
      const hero = page.getByRole("heading", {
        level: 2,
        name: /Turn your ideas/,
      });
      if (viewport.width >= 1024) await expect(hero).toBeVisible();
      else await expect(hero).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link")).toHaveCount(0);
      await expectNoWcag22AaViolations(
        page,
        `login ${viewport.width} ${dark ? "dark" : "light"}`,
      );
      await page.screenshot({
        path: testInfo.outputPath(
          `login-${viewport.width}-${dark ? "dark" : "light"}.png`,
        ),
        fullPage: true,
      });
    }
  }
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "password");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(email).toBeFocused();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expectNoWcag22AaViolations(page, "login field validation");
});

test("branding and labelled form are server-rendered without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: webBaseUrl,
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("real sign-in preserves safe next paths, existing signed-in behavior and expired-session recovery", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const user = testUser("member");
  await signInThroughUi(page, user);
  await page.goto("/login");
  // UI-04 owns signed-in entry policy; UI-02 must not revoke/redirect a session.
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect(
    (await page.request.get(`${apiBaseUrl}/api/v1/auth/me`)).status(),
  ).toBe(200);
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )!.value;
  expect(
    (
      await page.request.post(`${apiBaseUrl}/api/v1/auth/logout`, {
        headers: { "x-csrf-token": csrf },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/calendar");
  await expect(
    page.getByText(
      "Your session expired. Sign in again to recover your calendar.",
    ),
  ).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcalendar$/);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL("/calendar");
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
});

test("real sign-in cannot redirect to an external next target", async ({
  page,
}) => {
  const user = testUser("member");
  await page.goto("/login?next=https%3A%2F%2Fexample.com");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL("/");
});

test.describe("Lela login mobile network profiles", () => {
  test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
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
    test(`${profile.name}: cold login and keyboard sign-in stay operable within hard budgets`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => {
        const metrics = { lcp: 0, interactions: [] as number[] };
        Object.defineProperty(window, "lelaLoginMetrics", { value: metrics });
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
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: profile.latency,
        downloadThroughput: profile.down / 8,
        uploadThroughput: profile.up / 8,
      });
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Show password" }).click();
      await page.getByRole("button", { name: "Hide password" }).click();
      await expectNoWcag22AaViolations(page, `login mobile ${profile.name}`);
      await testInfo.attach(`login-${profile.name}-screen`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      const user = testUser("member");
      await page.getByLabel("Email", { exact: true }).fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      const loginMetrics = await page.evaluate(
        () =>
          (
            window as unknown as {
              lelaLoginMetrics: { lcp: number; interactions: number[] };
            }
          ).lelaLoginMetrics,
      );
      const signInStarted = performance.now();
      await page.getByLabel("Password", { exact: true }).press("Enter");
      await expect(page).toHaveURL("/");
      expect(
        (await page.request.get(`${apiBaseUrl}/api/v1/auth/me`)).status(),
      ).toBe(200);
      const sampledInpUpperBound = Math.max(16, ...loginMetrics.interactions);
      await testInfo.attach(`login-${profile.name}-metrics`, {
        body: JSON.stringify({
          ...profile,
          ...loginMetrics,
          sampledInpUpperBound,
          signInElapsedMs: performance.now() - signInStarted,
          viewport: "360x800 DPR2",
          cache: "disabled",
          note: "Short-journey Event Timing sample, not field INP; login-document LCP.",
        }),
        contentType: "application/json",
      });
      expect(loginMetrics.lcp).toBeGreaterThan(0);
      expect(loginMetrics.lcp).toBeLessThanOrEqual(profile.lcpLimit);
      expect(sampledInpUpperBound).toBeLessThanOrEqual(profile.inpLimit);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await cdp.detach();
    });
  }
});
