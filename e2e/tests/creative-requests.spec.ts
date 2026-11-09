import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";

/**
 * EVE-232 browser journey: the Promotional Manager sends a creative request
 * from the Promotion workspace, the Production manager accepts it on the
 * creative requests page (which creates a Production task), and the
 * Marketing Manager sees it read-only.
 */

async function pageAs(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: authStatePath(key),
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

async function openRequest(page: Page, title: string) {
  await page.getByRole("searchbox", { name: "Search" }).fill(title);
  await page
    .getByRole("list", { name: "Requests" })
    .getByRole("button", { name: new RegExp(title) })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("a creative request goes from Promotion to Production and back", async ({
  browser,
}) => {
  const title = `Festival poster ${randomUUID().slice(0, 8)}`;

  // Promotion sends it.
  const promotion = await pageAs(browser, "promotionManager");
  await promotion.goto("/promotion?tab=creative-requests");
  await promotion.getByRole("button", { name: "New request" }).click();
  const dialog = promotion.getByRole("dialog", {
    name: "New creative request",
  });
  await dialog.getByLabel("Title").fill(title);
  await dialog
    .getByLabel("Requirements")
    .fill("A2 portrait, festival palette, logo bottom right.");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog).toBeHidden();
  await expect(promotion.getByRole("heading", { name: title })).toBeVisible();
  await expect(promotion.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(
    promotion.getByRole("button", { name: "Cancel request" }),
  ).toBeVisible();
  await expect(promotion.getByRole("button", { name: "Accept" })).toHaveCount(
    0,
  );

  // Production accepts it; a Production task is created.
  const production = await pageAs(browser, "productionManager");
  await production.goto("/creative-requests");
  await openRequest(production, title);
  await expect(
    production.getByRole("button", { name: "New request" }),
  ).toHaveCount(0);
  await production.getByRole("button", { name: "Accept" }).click();
  await expect(production.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(production.getByRole("link", { name: title })).toHaveAttribute(
    "href",
    /\/tasks\//,
  );

  // Marketing sees it, read-only.
  const marketing = await pageAs(browser, "marketingManager");
  await marketing.goto("/promotion?tab=creative-requests");
  await openRequest(marketing, title);
  await expect(marketing.getByText("View only")).toBeVisible();
  await expect(
    marketing.getByRole("button", { name: "Start work" }),
  ).toHaveCount(0);
  await expect(marketing.getByLabel("Add feedback")).toHaveCount(0);
});

test("the creative requests page fits a phone screen", async ({ browser }) => {
  const page = await pageAs(browser, "productionManager");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/creative-requests");
  await expect(
    page.getByRole("region", { name: "Creative requests" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
});
