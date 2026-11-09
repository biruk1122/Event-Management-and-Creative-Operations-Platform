import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";

/**
 * EVE-231 (Phase 2) browser journeys for the Promotion workspace, plus the
 * layout at phone, tablet and desktop widths. The Promotional Manager runs the
 * department; the Marketing Manager sees the same workspace read-only.
 */

const VIEWPORTS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
}

test.describe("Promotion workspace — Promotional Manager", () => {
  test.use({ storageState: authStatePath("promotionManager") });

  test("shows the department workspace with its sections and the activities list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/promotion");

    await expect(
      page.getByText("Promotional Manager", { exact: true }),
    ).toBeVisible();
    const sections = page.getByRole("navigation", {
      name: "Promotion workspace sections",
    });
    await expect(sections.getByRole("button")).toHaveCount(10);

    await sections
      .getByRole("button", { name: "Promotional Activities" })
      .click();
    await expect(page).toHaveURL(/tab=activities/);
    await expect(
      page.getByRole("region", { name: "Promotional activities", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();

    await sections.getByRole("button", { name: "Calendar" }).click();
    await expect(page).toHaveURL(/tab=calendar/);
    await expect(
      page.getByRole("region", { name: "Promotion calendar" }),
    ).toBeVisible();
  });

  test("keeps the section in the URL across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/promotion?tab=tasks");
    await expect(
      page
        .getByRole("navigation", { name: "Promotion workspace sections" })
        .getByRole("button", { name: "Team Tasks" }),
    ).toHaveAttribute("aria-current", "page");
  });

  for (const viewport of VIEWPORTS) {
    test(`lays out at ${viewport.width}px without sideways scrolling (${viewport.name})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/promotion?tab=activities");
      await expect(
        page.getByRole("region", {
          name: "Promotional activities",
          exact: true,
        }),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `promotion-${viewport.name}-${viewport.width}.png`,
        ),
        fullPage: true,
      });
    });
  }
});

test.describe("Promotion workspace — Marketing Manager (read-only oversight)", () => {
  test.use({ storageState: authStatePath("marketingManager") });

  test("opens the Promotion workspace as view-only oversight with no change controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/promotion");

    await expect(page.getByText("Marketing Manager · read-only")).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "View-only oversight" }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Promotion workspace sections" })
      .getByRole("button", { name: "Campaigns" })
      .click();
    await expect(
      page.getByRole("button", { name: "New campaign" }),
    ).toHaveCount(0);
  });

  test("keeps the read-only layout within phone width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/promotion");
    await expect(page.getByText("Marketing Manager · read-only")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Promotion workspace — team member", () => {
  test.use({ storageState: authStatePath("promotionMember") });

  test("opens the team member's own workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/promotion");
    await expect(
      page.getByText("Promotion Team Member", { exact: true }),
    ).toBeVisible();
  });
});
