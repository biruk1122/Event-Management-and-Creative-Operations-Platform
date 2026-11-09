import { randomUUID } from "node:crypto";

import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

/**
 * EVE-233 browser journeys: partnerships with their agreement, campaign
 * expenses and the campaign budget in the Promotion workspace, who may change
 * what, and the creative request delivery rule.
 */

async function api(key: string): Promise<{
  context: APIRequestContext;
  csrf: string;
}> {
  const context = await request.newContext({
    storageState: authStatePath(key),
  });
  await context.get(`${apiBaseUrl}/api/v1/auth/me`);
  const csrf =
    (await context.storageState()).cookies.find(
      (cookie) => cookie.name === "csrf_token",
    )?.value ?? "";
  return { context, csrf };
}

/** A promotion campaign with a 1,000.00 ETB budget, set up through the API. */
async function promotionCampaign(): Promise<{ id: string; name: string }> {
  const { context, csrf } = await api("promotionManager");
  const name = `Budget campaign ${randomUUID().slice(0, 8)}`;
  const created = await context.post(`${apiBaseUrl}/api/v1/campaigns`, {
    headers: { "x-csrf-token": csrf },
    data: { name, campaignType: "PROMOTION" },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  const budget = await context.put(
    `${apiBaseUrl}/api/v1/campaigns/${id}/budget`,
    {
      headers: { "x-csrf-token": csrf },
      data: { amount: 1000, currency: "ETB" },
    },
  );
  expect(budget.status()).toBe(200);
  await context.dispose();
  return { id, name };
}

async function pageAs(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: authStatePath(key),
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

test("a partnership is recorded with its agreement and campaign", async ({
  browser,
}) => {
  const campaign = await promotionCampaign();
  const organization = `Brightside Media ${randomUUID().slice(0, 8)}`;
  const page = await pageAs(browser, "promotionManager");
  await page.goto("/promotion?tab=partnerships");
  await page.getByRole("button", { name: "New partner" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organization name").fill(organization);
  await dialog.getByLabel("Category").fill("Media");
  await dialog.getByLabel("Partnership name (optional)").fill("Festival media");
  await dialog.getByLabel("Type (optional)").selectOption("MEDIA");
  await expect(
    dialog.getByRole("option", { name: campaign.name }),
  ).toBeAttached();
  await dialog
    .getByLabel("Related campaign (optional)")
    .selectOption({ label: campaign.name });
  await dialog.getByLabel("Agreed value (optional)").fill("5000");
  await dialog.getByLabel("Currency").fill("ETB");
  await dialog.getByRole("button", { name: "Create partner" }).click();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("button", { name: new RegExp(organization) })
    .filter({ visible: true })
    .first()
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByLabel("Partnership name (optional)")).toHaveValue(
    "Festival media",
  );
  await expect(
    detail.getByRole("region", { name: "Partnership documents" }),
  ).toBeVisible();
  await expect(detail.getByText("Add document")).toBeVisible();
});

test("a campaign expense is recorded and the budget adds it up", async ({
  browser,
}) => {
  const campaign = await promotionCampaign();
  const page = await pageAs(browser, "promotionManager");
  await page.goto("/promotion?tab=budget");
  await page
    .getByRole("list", { name: "Campaigns" })
    .getByRole("button", { name: new RegExp(campaign.name) })
    .click();
  const detail = page.getByRole("article", { name: `${campaign.name} budget` });
  await expect(detail.getByText("1,000.00 ETB").first()).toBeVisible();

  await detail.getByRole("button", { name: "New expense" }).click();
  const create = page.getByRole("dialog", { name: "New expense" });
  await create.getByLabel("Title (optional)").fill("Flyer printing");
  await create.getByLabel("Description").fill("A5 flyers, 2,000 copies");
  await create.getByLabel("Actual amount").fill("120.50");
  await create.getByRole("button", { name: "Create expense" }).click();
  await expect(create).toBeHidden();

  await detail.getByRole("button", { name: /Flyer printing/ }).click();
  const expense = page.getByRole("dialog");
  await expense.getByRole("button", { name: "Submit for approval" }).click();
  await expect(
    expense.getByText("Pending approval", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Submitted spending counts: 1,000.00 - 120.50 = 879.50 remaining.
  await expect(detail.getByText("120.50 ETB").first()).toBeVisible();
  await expect(detail.getByText("879.50 ETB")).toBeVisible();
});

test("the Marketing Manager sees budgets read-only, and team members do not see them", async ({
  browser,
}) => {
  const campaign = await promotionCampaign();
  const marketing = await pageAs(browser, "marketingManager");
  await marketing.goto("/promotion?tab=budget");
  await marketing
    .getByRole("list", { name: "Campaigns" })
    .getByRole("button", { name: new RegExp(campaign.name) })
    .click();
  await expect(
    marketing.getByRole("article", { name: `${campaign.name} budget` }),
  ).toBeVisible();
  await expect(
    marketing.getByRole("button", { name: "New expense" }),
  ).toHaveCount(0);
  await expect(
    marketing.getByRole("form", { name: "Set campaign budget" }),
  ).toHaveCount(0);

  const member = await pageAs(browser, "promotionMember");
  await member.goto("/promotion");
  await expect(
    member
      .getByRole("navigation", { name: "Promotion workspace sections" })
      .getByRole("button", { name: "Budget" }),
  ).toHaveCount(0);
});

test("Production cannot deliver creative work without a deliverable file", async ({
  browser,
}) => {
  const title = `Delivery rule ${randomUUID().slice(0, 8)}`;
  const { context, csrf } = await api("promotionManager");
  const created = await context.post(`${apiBaseUrl}/api/v1/creative-requests`, {
    headers: { "x-csrf-token": csrf },
    data: { title, assetType: "POSTER", requirements: "A2 portrait." },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  await context.dispose();
  const production = await api("productionManager");
  for (const action of ["accept", "start"]) {
    const moved = await production.context.post(
      `${apiBaseUrl}/api/v1/creative-requests/${id}/${action}`,
      { headers: { "x-csrf-token": production.csrf } },
    );
    expect(moved.status()).toBe(200);
  }
  await production.context.dispose();

  const page = await pageAs(browser, "productionManager");
  await page.goto(`/creative-requests?request=${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("No files yet.")).toBeVisible();
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  await expect(
    page.getByText("Attach at least one deliverable file before delivering."),
  ).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
});

test("the budget section fits a phone screen", async ({ browser }) => {
  await promotionCampaign();
  const page = await pageAs(browser, "promotionManager");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/promotion?tab=budget");
  await expect(
    page.getByRole("region", { name: "Campaign budgets" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
});
