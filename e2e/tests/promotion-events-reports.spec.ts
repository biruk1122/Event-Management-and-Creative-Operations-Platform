import { randomInt, randomUUID } from "node:crypto";

import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

/**
 * EVE-234 browser journeys: the upcoming events the Promotion team promotes,
 * the overview, the combined calendar, and a campaign completion report the
 * Marketing Manager reviews. Events stay read-only in the workspace.
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

/** An event another department owns (Super Admin creates it), starting soon,
 * and a promotion campaign linked to it. */
async function promotedEvent(): Promise<{
  eventName: string;
  campaignName: string;
  startAt: string;
}> {
  const suffix = randomUUID().slice(0, 8);
  const eventName = `Launch night ${suffix}`;
  const campaignName = `Launch push ${suffix}`;
  // Two hours ahead: upcoming, and on today's calendar in almost every case.
  const startAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const admin = await api("superAdmin");
  const event = await admin.context.post(`${apiBaseUrl}/api/v1/events`, {
    headers: { "x-csrf-token": admin.csrf },
    data: {
      name: eventName,
      eventType: "CONCERT",
      startAt,
      location: "Millennium Hall",
    },
  });
  expect(event.status()).toBe(201);
  const eventId = ((await event.json()) as { id: string }).id;
  await admin.context.dispose();

  const manager = await api("promotionManager");
  const campaign = await manager.context.post(
    `${apiBaseUrl}/api/v1/campaigns`,
    {
      headers: { "x-csrf-token": manager.csrf },
      data: { name: campaignName, campaignType: "PROMOTION", eventId },
    },
  );
  expect(campaign.status()).toBe(201);
  await manager.context.dispose();
  return { eventName, campaignName, startAt };
}

async function pageAs(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: authStatePath(key),
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

function monthIn(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Addis_Ababa",
  }).format(new Date(iso));
}

test("the Promotion team sees upcoming events with their campaigns, read-only", async ({
  browser,
}) => {
  const promoted = await promotedEvent();
  const page = await pageAs(browser, "promotionManager");
  await page.goto("/promotion?tab=event-promotions");
  const section = page.getByRole("region", { name: "Event promotions" });
  await section.getByLabel("Search").fill(promoted.eventName);
  await expect(section.getByText(promoted.eventName)).toBeVisible();
  await expect(
    section.getByRole("list", {
      name: `Promotion campaigns for ${promoted.eventName}`,
    }),
  ).toContainText(promoted.campaignName);
  await expect(section.getByText("Millennium Hall")).toBeVisible();
  await expect(
    section.getByRole("button", { name: /edit|delete/i }),
  ).toHaveCount(0);
  await expectNoWcag22AaViolations(page, "promotion event promotions");

  // The overseeing Marketing Manager reads the same schedule.
  const marketing = await pageAs(browser, "marketingManager");
  await marketing.goto("/promotion?tab=event-promotions");
  const oversight = marketing.getByRole("region", { name: "Event promotions" });
  await oversight.getByLabel("Search").fill(promoted.eventName);
  await expect(oversight.getByText(promoted.eventName)).toBeVisible();
});

test("the overview and the calendar bring the work together", async ({
  browser,
}) => {
  const promoted = await promotedEvent();
  const page = await pageAs(browser, "promotionManager");
  await page.goto("/promotion");
  const workspace = page.getByRole("region", { name: "Promotion workspace" });
  await expect(
    workspace.getByRole("heading", { name: "Campaigns by status" }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("heading", { name: "Next events" }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("heading", { name: "Budget and expenses" }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("heading", { name: "Performance indicators" }),
  ).toBeVisible();
  await expectNoWcag22AaViolations(page, "promotion overview");

  await page
    .getByRole("navigation", { name: "Promotion workspace sections" })
    .getByRole("button", { name: "Calendar" })
    .click();
  const calendar = page.getByRole("region", { name: "Promotion calendar" });
  const month = monthIn(promoted.startAt);
  // Wait for the calendar to render, then step only if it opened on another
  // month (the event can fall on the next month when this runs near a month end).
  const heading = calendar.getByRole("heading", { level: 3 });
  await expect(heading).toBeVisible();
  if ((await heading.textContent())?.trim() !== month) {
    await calendar.getByRole("button", { name: "Next month" }).click();
  }
  await expect(calendar.getByRole("heading", { name: month })).toBeVisible();
  await expect(
    calendar.getByRole("table").getByText(promoted.eventName),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "List" }).click();
  await expect(calendar.getByText(promoted.eventName)).toBeVisible();
  await expectNoWcag22AaViolations(page, "promotion calendar list");
});

test("a campaign completion report goes to the Marketing Manager for review", async ({
  browser,
}) => {
  const promoted = await promotedEvent();
  // Reports are unique per author, type and start date; a random start keeps
  // retries and reruns apart.
  const start = new Date(Date.UTC(2024, 0, 1) + randomInt(0, 700) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const title = `Completion ${randomUUID().slice(0, 8)}`;

  const page = await pageAs(browser, "promotionManager");
  await page.goto("/promotion?tab=reports");
  await page.getByRole("button", { name: "New report" }).click();
  const form = page.getByRole("form", { name: "Report draft" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Report type").selectOption("CAMPAIGN_COMPLETION");
  await expect(
    form.getByRole("option", { name: promoted.campaignName }),
  ).toBeAttached();
  await form
    .getByLabel("Campaign")
    .selectOption({ label: promoted.campaignName });
  await form.getByLabel("Period start (UTC)").fill(start);
  await form.getByLabel("Period end (UTC)").fill(start);
  await form
    .getByLabel("Results and achievements")
    .fill("Sold out the launch night.");
  await form.getByLabel("What got in the way").fill("Late poster delivery.");
  await form.getByLabel("Lessons learned").fill("Book radio slots earlier.");
  await form
    .getByLabel("Recommendations for next time")
    .fill("Repeat the street team.");
  await expectNoWcag22AaViolations(page, "completion report draft");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible();

  const marketing = await pageAs(browser, "marketingManager");
  await marketing.goto("/promotion?tab=reports");
  await marketing.getByRole("button", { name: title }).first().click();
  await expect(
    marketing.getByText("Campaign completion").first(),
  ).toBeVisible();
  await marketing.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(marketing.getByText("Reviewed").first()).toBeVisible();
});

test("the calendar and event list fit a phone screen", async ({ browser }) => {
  await promotedEvent();
  const page = await pageAs(browser, "promotionManager");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const tab of ["calendar", "event-promotions", ""]) {
    await page.goto(`/promotion${tab ? `?tab=${tab}` : ""}`);
    await expect(
      page.getByRole("region", { name: "Promotion workspace" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
