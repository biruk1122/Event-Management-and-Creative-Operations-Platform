import { expect, test } from "@playwright/test";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { testUser } from "../fixtures/test-users.js";
import { apiBaseUrl, webBaseUrl } from "../fixtures/environment.js";

for (const role of [
  "superAdmin",
  "manager",
  "deptManager",
  "member",
  "talentManager",
]) {
  test.describe(`shell account ${role}`, () => {
    test.use({ storageState: authStatePath(role) });
    test("uses actual grants and retains navigation on denied and unknown routes", async ({
      page,
    }) => {
      await page.goto("/");
      const primary = page.getByRole("navigation", {
        name: "Primary",
        exact: true,
      });
      await expect(
        primary.getByRole("link", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      if (role === "superAdmin")
        await expect(
          primary.getByRole("link", { name: "Users", exact: true }),
        ).toBeVisible();
      const response = await page.request.get(
        `${apiBaseUrl}/api/v1/auth/me/permissions`,
      );
      expect(response.ok()).toBe(true);
      const access = (await response.json()) as {
        grants: { permissionKey: string; scope: string }[];
      };
      const canReadUsers = access.grants.some(
        (g) => g.permissionKey === "user.read" && g.scope === "ORGANIZATION",
      );
      await expect(
        primary.getByRole("link", { name: "Users", exact: true }),
      ).toHaveCount(canReadUsers ? 1 : 0);
      if (role === "member") {
        await expect(
          primary.getByRole("link", { name: "Analytics", exact: true }),
        ).toHaveCount(0);
      }
      if (role === "talentManager")
        await expect(
          primary.getByRole("link", { name: "Talent", exact: true }),
        ).toBeVisible();
      if (role === "manager")
        await expect(
          primary.getByRole("link", { name: "Talent", exact: true }),
        ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Account", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Settings", exact: true }),
      ).toHaveCount(0);
      await expectNoWcag22AaViolations(page, `${role} home shell`);
      await page.goto("/not-a-shipped-route");
      await expect(
        page.getByRole("heading", { name: "This view does not exist" }),
      ).toBeVisible();
      await expect(
        primary.getByRole("link", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, `${role} 404 shell`);
      if (role === "member") {
        await page.goto("/analytics");
        await expect(
          page.getByRole("heading", {
            name: "Analytics access required",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          primary.getByRole("link", { name: "Analytics", exact: true }),
        ).toHaveCount(0);
      }
    });
  });
}

test.describe("responsive shell", () => {
  test.use({ storageState: authStatePath("superAdmin") });
  for (const dark of [false, true]) {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 720, height: 450 },
    ]) {
      test(`${dark ? "dark" : "light"} ${viewport.width}x${viewport.height}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/dashboard");
        await expect(
          page.getByRole("heading", {
            name: "Dashboard",
            exact: true,
            level: 1,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Open notifications", exact: true }),
        ).toBeVisible();
        if (dark)
          await page.evaluate(() =>
            document.documentElement.classList.add("dark"),
          );
        await expectNoWcag22AaViolations(page, "responsive dashboard shell");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath("shell.png"),
          fullPage: true,
        });
        await page.screenshot({
          path: testInfo.outputPath("shell-viewport.png"),
        });
        if (viewport.width < 1024) {
          const trigger = page.getByRole("button", { name: "Open navigation" });
          await expect(trigger).toBeVisible();
          await trigger.click();
          const dialog = page.getByRole("dialog", {
            name: "Navigation",
            exact: true,
          });
          await expect(dialog).toBeVisible();
          const bounds = await dialog.boundingBox();
          expect(bounds?.x).toBeGreaterThanOrEqual(0);
          expect(bounds?.y).toBeGreaterThanOrEqual(0);
          expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
            viewport.width,
          );
          await expect(
            dialog.getByRole("link", { name: "Dashboard", exact: true }),
          ).toBeInViewport();
          await dialog
            .getByRole("link", { name: "Roles and permissions", exact: true })
            .scrollIntoViewIfNeeded();
          await expect(
            dialog.getByRole("link", {
              name: "Roles and permissions",
              exact: true,
            }),
          ).toBeInViewport();
          await expectNoWcag22AaViolations(page, "navigation drawer");
          for (let i = 0; i < 25; i++) {
            await page.keyboard.press("Tab");
            expect(
              await page.evaluate(
                () => !!document.activeElement?.closest('[role="dialog"]'),
              ),
            ).toBe(true);
          }
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          await trigger.click();
          await dialog
            .getByRole("link", { name: "Reports", exact: true })
            .click();
          await expect(page).toHaveURL(/\/reports$/);
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByRole("heading", {
              name: "Reports",
              exact: true,
              level: 1,
            }),
          ).toBeFocused();
        } else {
          await page.getByRole("button", { name: "Collapse sidebar" }).click();
          await page.reload();
          await expect(
            page.getByRole("button", { name: "Expand sidebar" }),
          ).toBeVisible();
          await expectNoWcag22AaViolations(page, "collapsed sidebar");
        }
      });
    }
  }
  test("sign-out removes privileged navigation before a different account signs in", async ({
    browser,
  }) => {
    // Own session: signing out must not revoke the shared setup storage state
    // used by later report/dashboard tests.
    const context = await browser.newContext({ baseURL: webBaseUrl });
    const page = await context.newPage();
    try {
      await signInThroughUi(page, testUser("superAdmin"));
      await page.goto("/");
      await expect(
        page
          .getByRole("navigation", { name: "Primary", exact: true })
          .getByRole("link", { name: "Users", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("navigation", { name: "Primary", exact: true }),
      ).toHaveCount(0);
      await signInThroughUi(page, testUser("member"));
      const primary = page.getByRole("navigation", {
        name: "Primary",
        exact: true,
      });
      await expect(
        primary.getByRole("link", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      await expect(
        primary.getByRole("link", { name: "Users", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
