import { expect, test, type Page } from "@playwright/test";
import { signInThroughUi } from "../fixtures/auth.js";
import { testUser } from "../fixtures/test-users.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { queryInSchema } from "../fixtures/database.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";

test.use({ storageState: { cookies: [], origins: [] } });
async function submit(page: Page, key = "member") {
  const user = testUser(key);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
}

test("root login and authenticated login visits reach dashboard without loops", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=(?:\/|%2F)$/);
  await submit(page);
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true, level: 1 }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/login?next=/login");
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("form", { name: "Sign in" })).toHaveCount(0);
  expect(
    (await page.request.get(`${apiBaseUrl}/api/v1/auth/me`)).status(),
  ).toBe(200);
});

test("fresh login preserves a permitted deep link and its URL state", async ({
  page,
}) => {
  const target = "/calendar?view=week&date=2026-10-09";
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  await submit(page);
  await expect(page).toHaveURL(target);
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true, level: 1 }),
  ).toBeVisible();
});

test("unsafe, unknown and permission-denied next targets fall back", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const target of [
    "https://example.com",
    "/calendar%",
    "/login",
    "/unknown",
    "/users",
    "/dashboard?audience=management",
    "/discuss/dm/12345678-1234-1234-1234-123456789abc",
  ]) {
    await page.context().clearCookies();
    await page.goto(`/login?next=${encodeURIComponent(target)}`);
    await submit(page);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("form", { name: "Sign in" })).toHaveCount(0);
  }
});

test("expired session returns to login; UI sign-out and re-login remain usable", async ({
  page,
}) => {
  await signInThroughUi(page, testUser("member"));
  const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
  const user = (await me.json()) as { id: string };
  // Only this fresh session, never the setup session used by other specs.
  await queryInSchema(
    process.env.DATABASE_URL!,
    `UPDATE auth_sessions SET issued_at = NOW() - INTERVAL '2 seconds', expires_at = NOW() - INTERVAL '1 second'
     WHERE id = (SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1)`,
    [user.id],
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=(?:\/|%2F)$/);
  await submit(page);
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  expect(
    (await page.request.get(`${apiBaseUrl}/api/v1/auth/me`)).status(),
  ).toBe(401);
  await submit(page);
  await expect(page).toHaveURL("/dashboard");
});

for (const key of ["superAdmin", "member"]) {
  test(`${key} entry retains dashboard audience and grant-aware Reports/Analytics`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await signInThroughUi(page, testUser(key));
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true, level: 1 }),
    ).toBeVisible();
    const grantsResponse = await page.request.get(
      `${apiBaseUrl}/api/v1/auth/me/permissions`,
    );
    expect(grantsResponse.ok()).toBe(true);
    const { grants } = (await grantsResponse.json()) as {
      grants: { permissionKey: string; scope: string }[];
    };
    await expect(
      page.getByRole("article", {
        name: key === "superAdmin" ? "Total events" : "My tasks",
        exact: true,
      }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 720, height: 450 },
    ]) {
      await page.setViewportSize(viewport);
      const mobile = viewport.width < 1024;
      if (mobile)
        await page.getByRole("button", { name: "Open navigation" }).click();
      const nav = page.getByRole("navigation", {
        name: mobile ? "Primary drawer" : "Primary",
        exact: true,
      });
      await expect(
        nav.getByRole("link", { name: "Reports", exact: true }),
      ).toHaveCount(
        grants.some((g) => g.permissionKey === "report.read") ? 1 : 0,
      );
      const analyticsAllowed = grants.some(
        (grant) =>
          [
            "analytics.management.read",
            "analytics.employee_performance.read",
            "analytics.department_performance.read",
          ].includes(grant.permissionKey) &&
          (["ORGANIZATION", "MANAGEMENT"].includes(grant.scope) ||
            (grant.permissionKey === "analytics.department_performance.read" &&
              grant.scope === "DEPARTMENT")),
      );
      await expect(
        nav.getByRole("link", { name: "Analytics", exact: true }),
      ).toHaveCount(analyticsAllowed ? 1 : 0);
      await expectNoWcag22AaViolations(
        page,
        `${key} dashboard entry ${viewport.width}`,
      );
      await page.screenshot({
        path: testInfo.outputPath(`entry-${key}-${viewport.width}.png`),
        fullPage: true,
      });
      if (mobile) await page.keyboard.press("Escape");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
