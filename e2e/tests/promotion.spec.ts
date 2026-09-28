import { randomUUID } from "node:crypto";

import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

type PromotionDetail = {
  activity: { id: string };
  channel: string;
  talents: { talentId: string; role: string }[];
};

async function csrfToken(context: APIRequestContext): Promise<string> {
  const token = (await context.storageState()).cookies.find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "authenticated context needs a CSRF cookie").toBeTruthy();
  return token as string;
}

async function seedPromotion(context: APIRequestContext) {
  const suffix = `${fixtureName("promotion")}-${randomUUID().slice(0, 8)}`;
  const headers = { "x-csrf-token": await csrfToken(context) };
  const campaignName = `E2E Promotion ${suffix}`;
  const activityName = `E2E Social teaser ${suffix}`;
  const talentName = `E2E Presenter ${suffix}`;

  const campaign = await context.post(`${apiBaseUrl}/api/v1/campaigns`, {
    headers,
    data: { name: campaignName, campaignType: "PROMOTION" },
  });
  expect(campaign.status()).toBe(201);
  const campaignId = ((await campaign.json()) as { id: string }).id;

  const activity = await context.post(
    `${apiBaseUrl}/api/v1/campaigns/${campaignId}/activities`,
    { headers, data: { name: activityName, status: "PLANNED" } },
  );
  expect(activity.status()).toBe(201);
  const activityId = ((await activity.json()) as { id: string }).id;

  const talent = await context.post(`${apiBaseUrl}/api/v1/talents`, {
    headers,
    data: { fullName: talentName, type: "PRESENTER" },
  });
  expect(talent.status()).toBe(201);
  const talentId = ((await talent.json()) as { id: string }).id;

  return {
    headers,
    campaignId,
    campaignName,
    activityId,
    activityName,
    talentId,
    talentName,
  };
}

async function openPromotion(page: Page, campaignName: string) {
  await page.goto("/campaigns");
  await page.getByRole("searchbox", { name: "Search" }).fill(campaignName);
  await page.getByRole("button", { name: campaignName }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: campaignName }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Promotion operations" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Promotion activities" }),
  ).toBeVisible();
  return dialog;
}

test.describe("Promotion operations — real-service workflow", () => {
  test.describe("Super Admin lifecycle", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("persists channel and talent changes through reload, handles conflicts, then removes only promotion detail", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const fixture = await seedPromotion(page.request);
      const endpoint = `${apiBaseUrl}/api/v1/promotion/campaigns/${fixture.campaignId}/activities`;
      const detailEndpoint = `${endpoint}/${fixture.activityId}`;

      const dialog = await openPromotion(page, fixture.campaignName);
      await expectNoWcag22AaViolations(
        page,
        "promotion operations before configuration",
      );
      await dialog
        .getByRole("button", { name: new RegExp(fixture.activityName) })
        .click();
      await dialog.getByLabel("Delivery channel").selectOption("SOCIAL_MEDIA");
      await dialog.getByRole("button", { name: "Add channel" }).click();
      await expect(dialog.getByText("Promotion channel added.")).toBeAttached();

      await expect
        .poll(async () => {
          const response = await page.request.get(detailEndpoint);
          return ((await response.json()) as PromotionDetail).channel;
        })
        .toBe("SOCIAL_MEDIA");

      const duplicate = await page.request.post(detailEndpoint, {
        headers: fixture.headers,
        data: { channel: "ADVERTISING" },
      });
      expect(duplicate.status()).toBe(409);
      expect((await duplicate.json()) as { code: string }).toMatchObject({
        code: "PROMOTION_DETAIL_CONFLICT",
      });

      await dialog
        .getByLabel("Delivery channel")
        .selectOption("RADIO_PROMOTION");
      await dialog.getByRole("button", { name: "Save channel" }).click();
      await expect(dialog.getByText("Channel updated.")).toBeAttached();

      await dialog
        .getByLabel("Talent", { exact: true })
        .selectOption(fixture.talentId);
      await dialog.getByLabel("Role", { exact: true }).fill("Presenter");
      await dialog.getByRole("button", { name: "Assign", exact: true }).click();
      await expect(
        dialog.getByText(`${fixture.talentName} · Presenter`),
      ).toBeVisible();

      const assigned = await queryInSchema<{ talent_id: string; role: string }>(
        process.env.DATABASE_URL!,
        `SELECT talent_id, role FROM promotion_activity_talents WHERE campaign_activity_id = $1`,
        [fixture.activityId],
      );
      expect(assigned).toEqual([
        { talent_id: fixture.talentId, role: "Presenter" },
      ]);

      await page.setViewportSize({ width: 360, height: 800 });
      await page.reload();
      const reopened = await openPromotion(page, fixture.campaignName);
      await reopened
        .getByRole("button", { name: new RegExp(fixture.activityName) })
        .click();
      await expect(reopened.getByLabel("Delivery channel")).toHaveValue(
        "RADIO_PROMOTION",
      );
      await expect(
        reopened.getByText(`${fixture.talentName} · Presenter`),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "promotion operations on mobile");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await reopened.getByRole("button", { name: "Remove talent" }).click();
      await expect(reopened.getByText("No talent assigned yet.")).toBeVisible();
      await reopened
        .getByRole("button", { name: "Remove promotion detail" })
        .click();
      await reopened.getByRole("button", { name: "Confirm removal" }).click();
      await expect(
        reopened.getByText(
          "This activity does not have a promotion channel yet.",
        ),
      ).toBeVisible();

      const remaining = await page.request.get(endpoint);
      expect(((await remaining.json()) as { total: number }).total).toBe(0);
      const shared = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns/${fixture.campaignId}/activities`,
      );
      expect(((await shared.json()) as { total: number }).total).toBe(1);
      expect(
        await queryInSchema(
          process.env.DATABASE_URL!,
          `SELECT campaign_activity_id FROM promotion_activities WHERE campaign_activity_id = $1`,
          [fixture.activityId],
        ),
      ).toHaveLength(0);
    });
  });

  test.describe("Management/Administrator permission boundary", () => {
    test.use({ storageState: authStatePath("manager") });

    test("can manage a channel but cannot assign talent without talent.assign", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const fixture = await seedPromotion(admin);
      await admin.dispose();

      const dialog = await openPromotion(page, fixture.campaignName);
      await dialog
        .getByRole("button", { name: new RegExp(fixture.activityName) })
        .click();
      await dialog.getByRole("button", { name: "Add channel" }).click();
      await expect(dialog.getByText("Promotion channel added.")).toBeAttached();
      await expect(dialog.getByRole("button", { name: "Assign" })).toHaveCount(
        0,
      );

      const blocked = await page.request.post(
        `${apiBaseUrl}/api/v1/promotion/campaigns/${fixture.campaignId}/activities/${fixture.activityId}/talents`,
        {
          headers: { "x-csrf-token": await csrfToken(page.request) },
          data: { talentId: fixture.talentId, role: "Presenter" },
        },
      );
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      expect(
        await queryInSchema(
          process.env.DATABASE_URL!,
          `SELECT id FROM promotion_activity_talents WHERE campaign_activity_id = $1`,
          [fixture.activityId],
        ),
      ).toHaveLength(0);
    });
  });
});
