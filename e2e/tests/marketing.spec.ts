import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

interface MarketingCampaign {
  id: string;
  workspaceId: string;
  campaignType: string;
  status: string;
  progress: {
    completedActivities: number;
    totalActivities: number;
    percent: number | null;
  };
  teams: { id: string; name: string }[];
}

async function csrfToken(context: APIRequestContext): Promise<string> {
  const token = (await context.storageState()).cookies.find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "an authenticated context needs a CSRF cookie").toBeTruthy();
  return token as string;
}

async function userIdByEmail(context: APIRequestContext, email: string) {
  const response = await context.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
  const user = (
    (await response.json()) as { items: { id: string; email: string }[] }
  ).items.find((candidate) => candidate.email === email);
  expect(user, `seeded user ${email} should be readable`).toBeTruthy();
  return user!.id;
}

async function seedCampaign(context: APIRequestContext, name: string) {
  const headers = { "x-csrf-token": await csrfToken(context) };
  const response = await context.post(`${apiBaseUrl}/api/v1/campaigns`, {
    headers,
    data: { name, campaignType: "MARKETING" },
  });
  expect(response.status()).toBe(201);
  return {
    campaign: (await response.json()) as MarketingCampaign,
    headers,
  };
}

async function openStrategy(page: Page, campaignName: string) {
  await page.goto("/campaigns?type=MARKETING");
  await page.getByRole("searchbox", { name: "Search" }).fill(campaignName);
  await page.getByRole("button", { name: campaignName }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: campaignName }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Marketing strategy" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Marketing strategy" }),
  ).toBeVisible();
  return dialog;
}

test.describe("Marketing campaigns and strategy — real-service workflow", () => {
  test.describe("Super Admin lifecycle", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates and reloads a connected strategy, campaign, team, activity, and assigned task", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const suffix = `${fixtureName("marketing")}-${randomUUID().slice(0, 8)}`;
      const campaignName = `E2E Marketing ${suffix}`;
      const teamName = `E2E Marketing Team ${suffix}`;
      const activityName = `E2E Marketing Activity ${suffix}`;
      const taskTitle = `E2E Marketing Task ${suffix}`;
      const initialStrategy = `Reach regional partners for ${suffix}.`;
      const revisedStrategy = `Focus on local partners for ${suffix}.`;
      const headers = { "x-csrf-token": await csrfToken(page.request) };
      const memberId = await userIdByEmail(page.request, "member@e2e.test");

      const department = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers, data: { name: `E2E Marketing Dept ${suffix}` } },
      );
      expect(department.status()).toBe(201);
      const team = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers,
        data: {
          name: teamName,
          departmentId: ((await department.json()) as { id: string }).id,
        },
      });
      expect(team.status()).toBe(201);
      const teamId = ((await team.json()) as { id: string }).id;

      await page.goto("/");
      const navigation = page.getByRole("link", {
        name: "Campaigns",
        exact: true,
      });
      await expect(navigation).toBeVisible();
      await navigation.click();
      await expect(page).toHaveURL("/campaigns");
      await page.getByRole("combobox", { name: "Filter by type" }).click();
      await page
        .getByRole("option", { name: "Marketing", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Filter by type" }),
      ).toContainText("Marketing");
      await expectNoWcag22AaViolations(page, "marketing campaign list");

      await page.getByRole("button", { name: "New campaign" }).click();
      const createDialog = page.getByRole("dialog");
      await createDialog.getByLabel("Name").fill(campaignName);
      await createDialog.getByRole("combobox", { name: "Type" }).click();
      await page
        .getByRole("option", { name: "Marketing", exact: true })
        .click();
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page
        .getByRole("option", { name: "member@e2e.test", exact: true })
        .click();
      await createDialog
        .getByRole("button", { name: "Create campaign" })
        .click();
      await expect(createDialog).toBeHidden();

      const listed = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns?search=${encodeURIComponent(campaignName)}`,
      );
      expect(listed.ok()).toBe(true);
      const created = ((await listed.json()) as { items: MarketingCampaign[] })
        .items[0];
      expect(
        created,
        "created marketing campaign should be listed",
      ).toBeTruthy();
      const campaign = created!;
      expect(campaign).toMatchObject({ campaignType: "MARKETING" });
      const strategyEndpoint = `${apiBaseUrl}/api/v1/marketing/campaigns/${campaign.id}/strategy`;

      await page.getByRole("searchbox", { name: "Search" }).fill(campaignName);
      await page.getByRole("button", { name: campaignName }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Assign a team" }).click();
      await page.getByRole("option", { name: teamName, exact: true }).click();
      await dialog.getByLabel("Amount").fill("2500");
      await dialog.getByLabel("Currency").fill("USD");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog.getByText("Current: 2500.00 USD")).toBeVisible();
      await dialog.getByRole("button", { name: "Add activity" }).click();
      const activityForm = dialog.getByRole("form", { name: "New activity" });
      await activityForm.getByLabel("Activity name").fill(activityName);
      await activityForm.getByRole("button", { name: "Add activity" }).click();
      await dialog
        .getByRole("combobox", { name: `Status of ${activityName}` })
        .click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      await expect(dialog.getByText(/1 of 1 activities.*100%/)).toBeVisible();
      await dialog.getByRole("combobox", { name: "Move to" }).click();
      await page.getByRole("option", { name: "Active", exact: true }).click();
      await dialog.getByRole("combobox", { name: "Move to" }).click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      await expect(
        dialog.getByText("Completed is a final state."),
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Marketing strategy" }).click();
      await expect(dialog.getByText("No strategy yet")).toBeVisible();
      await dialog.getByRole("button", { name: "Add strategy" }).click();
      await dialog
        .getByRole("textbox", { name: "Strategy" })
        .fill(initialStrategy);
      await dialog.getByRole("button", { name: "Save strategy" }).click();
      await expect(dialog.getByText(initialStrategy)).toBeVisible();
      await expectNoWcag22AaViolations(page, "marketing strategy workspace");

      const duplicate = await page.request.post(strategyEndpoint, {
        headers,
        data: { strategy: "Must not replace the existing strategy" },
      });
      expect(duplicate.status()).toBe(409);
      expect((await duplicate.json()) as { code: string }).toMatchObject({
        code: "MARKETING_STRATEGY_CONFLICT",
      });
      await dialog.getByRole("button", { name: "Edit strategy" }).click();
      await dialog
        .getByRole("textbox", { name: "Strategy" })
        .fill(revisedStrategy);
      await dialog.getByRole("button", { name: "Save strategy" }).click();
      await expect(dialog.getByText(revisedStrategy)).toBeVisible();

      const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
        headers,
        data: { title: taskTitle, workspaceId: campaign.workspaceId },
      });
      expect(task.status()).toBe(201);
      const taskId = ((await task.json()) as { id: string }).id;
      const assignment = await page.request.put(
        `${apiBaseUrl}/api/v1/tasks/${taskId}/assignees/${memberId}`,
        { headers },
      );
      expect(assignment.status()).toBe(200);

      await page.setViewportSize({ width: 360, height: 800 });
      await page.reload();
      const reopened = await openStrategy(page, campaignName);
      await expect(reopened.getByText(revisedStrategy)).toBeVisible();
      await expect(reopened.getByText(teamName, { exact: true })).toBeVisible();
      await reopened
        .getByRole("button", { name: "Overview and activities" })
        .click();
      await expect(reopened.getByText("Current: 2500.00 USD")).toBeVisible();
      await expect(reopened.getByText(/1 of 1 activities.*100%/)).toBeVisible();
      await reopened
        .getByRole("button", { name: "Marketing strategy" })
        .click();
      await expect(reopened.getByText(revisedStrategy)).toBeVisible();
      await expectNoWcag22AaViolations(page, "marketing strategy on mobile");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      const storedStrategy = await queryInSchema<{ strategy: string }>(
        process.env.DATABASE_URL!,
        "SELECT strategy FROM marketing_campaigns WHERE campaign_id = $1",
        [campaign.id],
      );
      expect(storedStrategy).toEqual([{ strategy: revisedStrategy }]);
      const storedCampaign = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns/${campaign.id}`,
      );
      expect((await storedCampaign.json()) as MarketingCampaign).toMatchObject({
        workspaceId: campaign.workspaceId,
        status: "COMPLETED",
        progress: {
          completedActivities: 1,
          totalActivities: 1,
          percent: 100,
        },
        teams: [{ id: teamId }],
      });
      const storedTask = await page.request.get(
        `${apiBaseUrl}/api/v1/tasks/${taskId}`,
      );
      expect((await storedTask.json()) as object).toMatchObject({
        workspaceId: campaign.workspaceId,
        assignees: [{ id: memberId }],
      });

      await reopened.getByRole("button", { name: "Remove strategy" }).click();
      await reopened.getByRole("button", { name: "Confirm removal" }).click();
      await expect(reopened.getByText("No strategy yet")).toBeVisible();
      expect((await page.request.get(strategyEndpoint)).status()).toBe(404);
      expect(
        await queryInSchema(
          process.env.DATABASE_URL!,
          "SELECT campaign_id FROM marketing_campaigns WHERE campaign_id = $1",
          [campaign.id],
        ),
      ).toHaveLength(0);
      expect(
        (
          await page.request.get(
            `${apiBaseUrl}/api/v1/campaigns/${campaign.id}`,
          )
        ).status(),
      ).toBe(200);
    });
  });

  test.describe("conflict and denied access", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("keeps a draft after a real concurrent strategy conflict", async ({
      page,
    }) => {
      const name = `E2E Marketing Conflict ${randomUUID().slice(0, 8)}`;
      const { campaign, headers } = await seedCampaign(page.request, name);
      const dialog = await openStrategy(page, name);
      await expect(dialog.getByText("No strategy yet")).toBeVisible();
      await dialog.getByRole("button", { name: "Add strategy" }).click();
      const draft = `Keep my draft for ${name}`;
      await dialog.getByRole("textbox", { name: "Strategy" }).fill(draft);

      const concurrent = await page.request.post(
        `${apiBaseUrl}/api/v1/marketing/campaigns/${campaign.id}/strategy`,
        { headers, data: { strategy: "Concurrent strategy" } },
      );
      expect(concurrent.status()).toBe(201);
      await dialog.getByRole("button", { name: "Save strategy" }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        "A strategy was added elsewhere",
      );
      await expect(
        dialog.getByRole("textbox", { name: "Strategy" }),
      ).toHaveValue(draft);
      expect(
        await queryInSchema<{ strategy: string }>(
          process.env.DATABASE_URL!,
          "SELECT strategy FROM marketing_campaigns WHERE campaign_id = $1",
          [campaign.id],
        ),
      ).toEqual([{ strategy: "Concurrent strategy" }]);
    });

    test("hides marketing navigation and rejects strategy reads and writes without organization access", async ({
      page,
      browser,
    }) => {
      const name = `E2E Marketing Denied ${randomUUID().slice(0, 8)}`;
      const { campaign } = await seedCampaign(page.request, name);
      const restricted = await browser.newContext({
        storageState: authStatePath("deptManager"),
      });
      try {
        const restrictedPage = await restricted.newPage();
        await restrictedPage.goto("/");
        await expect(
          restrictedPage.getByRole("link", { name: "Campaigns", exact: true }),
        ).toHaveCount(0);
        await restrictedPage.goto("/campaigns?type=MARKETING");
        await expect(
          restrictedPage.getByText("You do not have access to this area."),
        ).toBeVisible();

        const endpoint = `${apiBaseUrl}/api/v1/marketing/campaigns/${campaign.id}/strategy`;
        expect((await restrictedPage.request.get(endpoint)).status()).toBe(403);
        const refused = await restrictedPage.request.post(endpoint, {
          headers: { "x-csrf-token": await csrfToken(restrictedPage.request) },
          data: { strategy: "Must not be saved" },
        });
        expect(refused.status()).toBe(403);
        expect((await refused.json()) as { code: string }).toMatchObject({
          code: "PERMISSION_DENIED",
        });
        expect(
          await queryInSchema(
            process.env.DATABASE_URL!,
            "SELECT campaign_id FROM marketing_campaigns WHERE campaign_id = $1",
            [campaign.id],
          ),
        ).toHaveLength(0);
      } finally {
        await restricted.close();
      }
    });
  });
});
