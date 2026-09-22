import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

/** The list caption renders `N campaign` / `N campaigns`. */
function campaignCount(total: number): string {
  return `${total} campaign${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

interface ApiCampaign {
  id: string;
  workspaceId: string;
  name: string;
  campaignType: string;
  status: string;
  eventId: string | null;
  productName: string | null;
  manager: { id: string; email: string } | null;
  teams: { id: string; name: string }[];
  progress: {
    completedActivities: number;
    totalActivities: number;
    percent: number | null;
  };
}

async function userIdByEmail(
  requester: Pick<Page, "request">,
  email: string,
): Promise<string> {
  const response = await requester.request.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  const user = (
    (await response.json()) as { items: { id: string; email: string }[] }
  ).items.find((candidate) => candidate.email === email);
  expect(user, `seeded user ${email} should be readable`).toBeTruthy();
  return user!.id;
}

test.describe("Campaign platform — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates a campaign, assigns its manager and team, sets a budget, tracks activity progress, moves through its lifecycle, persists through reload, then unassigns and deletes", async ({
      page,
    }) => {
      // A random tail on top of the run-scoped name so a Playwright retry,
      // which restarts the fixture sequence in a fresh worker, cannot collide
      // with the failed attempt's still-present department.
      const suffix = `${fixtureName("campaign")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const departmentName = `E2E CAM Dept ${suffix}`;
      const teamName = `E2E CAM Team ${suffix}`;
      const campaignName = `E2E Launch ${suffix}`;
      const activityName = `E2E Activity ${suffix}`;
      const relatedEventName = `E2E CAM Related Event ${suffix}`;
      const managerEmail = "member@e2e.test";

      // A team is department-owned, so create the owning department and team
      // through the API before driving the campaign UI. Also create a real
      // event to use as the campaign's related subject later.
      const departmentResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers: { "x-csrf-token": csrf }, data: { name: departmentName } },
      );
      expect(departmentResponse.status()).toBe(201);
      const teamResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/teams`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            name: teamName,
            departmentId: ((await departmentResponse.json()) as { id: string })
              .id,
          },
        },
      );
      expect(teamResponse.status()).toBe(201);
      const teamId = ((await teamResponse.json()) as { id: string }).id;
      const eventResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/events`,
        {
          headers: { "x-csrf-token": csrf },
          data: { name: relatedEventName, eventType: "OTHER" },
        },
      );
      expect(eventResponse.status()).toBe(201);
      const relatedEventId = ((await eventResponse.json()) as { id: string })
        .id;
      const managerId = await userIdByEmail(page, managerEmail);

      // The account holds campaign.read at organization scope, so the nav
      // entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Campaigns" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/campaigns");
      await expect(
        page.getByRole("heading", { level: 1, name: "Campaigns" }),
      ).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/campaigns`);
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(campaignCount(baseline), { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "campaigns list");

      // Create a campaign through the dialog.
      await page.getByRole("button", { name: "New campaign" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New campaign" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create campaign dialog");

      await createDialog.getByLabel("Name").fill(campaignName);
      await createDialog.getByRole("combobox", { name: "Type" }).click();
      await page
        .getByRole("option", { name: "Promotion", exact: true })
        .click();
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page
        .getByRole("option", { name: managerEmail, exact: true })
        .click();
      await createDialog
        .getByRole("button", { name: "Create campaign" })
        .click();

      await expect(
        page.getByText(campaignCount(baseline + 1), { exact: true }),
      ).toBeVisible();

      // Find the new campaign in the authoritative store.
      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns?search=${encodeURIComponent(campaignName)}`,
      );
      const created = (
        (await listAfterCreate.json()) as { items: ApiCampaign[] }
      ).items[0];
      expect(created, "created campaign should be readable").toBeTruthy();
      const campaignId = created!.id;
      expect(created).toMatchObject({
        name: campaignName,
        campaignType: "PROMOTION",
        status: "PLANNED",
        manager: { id: managerId },
        teams: [],
      });

      const createdRows = await queryInSchema<{
        campaign_type: string;
        status: string;
        workspace_id: string;
      }>(
        runDatabaseUrl(),
        `SELECT campaign_type, status, workspace_id FROM campaigns WHERE id = $1`,
        [campaignId],
      );
      expect(createdRows).toEqual([
        {
          campaign_type: "PROMOTION",
          status: "PLANNED",
          workspace_id: created!.workspaceId,
        },
      ]);

      // Open the detail dialog and assign the team. (The list renders both a
      // desktop row and a mobile card; only one is in the a11y tree at the
      // test viewport, but `.first()` keeps this stable regardless.)
      await page.getByRole("button", { name: campaignName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: campaignName }),
      ).toBeVisible();

      await detail.getByRole("combobox", { name: "Assign a team" }).click();
      await page.getByRole("option", { name: teamName, exact: true }).click();
      await expect(detail.getByText(teamName, { exact: true })).toBeVisible();

      const joinRows = await queryInSchema<{ team_id: string }>(
        runDatabaseUrl(),
        `SELECT team_id
           FROM workspace_teams
          WHERE workspace_id = $1`,
        [created!.workspaceId],
      );
      expect(joinRows).toEqual([{ team_id: teamId }]);

      // Set a budget.
      await detail.getByLabel("Amount").fill("15000");
      await detail.getByLabel("Currency").fill("USD");
      await detail.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        detail.getByText("Current: 15000.00 USD", { exact: true }),
      ).toBeVisible();

      // Add an activity and track derived progress as its status changes -
      // campaign-specific behavior Events does not have.
      await detail.getByRole("button", { name: "Add activity" }).click();
      const activityForm = detail.getByRole("form", { name: "New activity" });
      await activityForm.getByLabel("Activity name").fill(activityName);
      await activityForm.getByRole("button", { name: "Add activity" }).click();
      await expect(
        detail.getByText(activityName, { exact: true }),
      ).toBeVisible();
      await expect(
        detail.getByText("0 of 1 activities · 0%", { exact: true }),
      ).toBeVisible();

      await detail
        .getByRole("combobox", { name: `Status of ${activityName}` })
        .click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      await expect(
        detail.getByText("1 of 1 activities · 100%", { exact: true }),
      ).toBeVisible();

      const activityRows = await queryInSchema<{ status: string }>(
        runDatabaseUrl(),
        `SELECT status FROM campaign_activities WHERE campaign_id = $1`,
        [campaignId],
      );
      expect(activityRows).toEqual([{ status: "COMPLETED" }]);

      // Move through the approved lifecycle graph, cross-checking the
      // authoritative status after each move (the UI resets its picker to a
      // placeholder rather than showing the current value).
      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page.getByRole("option", { name: "Active", exact: true }).click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
          );
          return ((await response.json()) as ApiCampaign).status;
        })
        .toBe("ACTIVE");

      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      // A terminal state has no further moves: the picker is replaced by text.
      await expect(
        detail.getByText("Completed is a final state.", { exact: true }),
      ).toBeVisible();

      // Edit the campaign's details, including relating it to the event
      // created above.
      const renamedTo = `${campaignName} Renamed`;
      await detail.getByLabel("Name").fill(renamedTo);
      await detail
        .getByRole("combobox", { name: "Related subject (optional)" })
        .click();
      await page.getByRole("option", { name: "An event", exact: true }).click();
      await detail
        .getByRole("combobox", { name: "Event", exact: true })
        .click();
      await page
        .getByRole("option", { name: relatedEventName, exact: true })
        .click();
      await detail
        .getByRole("button", { name: "Save details", exact: true })
        .click();
      await expect(
        detail.getByRole("heading", { name: renamedTo }),
      ).toBeVisible();
      await expect(
        detail.getByText(`Event: ${relatedEventName}`, { exact: false }),
      ).toBeVisible();
      const afterSubjectEdit = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
      );
      expect((await afterSubjectEdit.json()) as ApiCampaign).toMatchObject({
        eventId: relatedEventId,
        productName: null,
      });

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(campaignCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: renamedTo }).first().click();
      const reopened = page.getByRole("dialog");
      await expect(
        reopened.getByRole("heading", { name: renamedTo }),
      ).toBeVisible();
      await expect(
        reopened.getByText("Completed is a final state.", { exact: true }),
      ).toBeVisible();
      await expect(reopened.getByText(teamName, { exact: true })).toBeVisible();
      await expect(
        reopened.getByText("Current: 15000.00 USD", { exact: true }),
      ).toBeVisible();
      await expect(
        reopened.getByText("1 of 1 activities · 100%", { exact: true }),
      ).toBeVisible();

      // Highest-risk business-rule failure #1: a completed campaign cannot
      // move again, enforced server-side regardless of what the UI offers.
      const invalidMove = await page.request.post(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}/transition`,
        {
          headers: { "x-csrf-token": csrf },
          data: { status: "ACTIVE" },
        },
      );
      expect(invalidMove.status()).toBe(409);
      expect((await invalidMove.json()) as { code: string }).toMatchObject({
        code: "CAMPAIGN_INVALID_TRANSITION",
      });

      // Highest-risk business-rule failure #2, campaign-specific: a related
      // event and a related product can never coexist. The UI's subject
      // picker is structurally one-of-three and cannot produce this, but the
      // API must still refuse a direct attempt - the campaign already has
      // `relatedEventId` set from the edit above, so setting a product on
      // top of it (without clearing the event) is exactly this conflict.
      const conflict = await page.request.patch(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
        {
          headers: { "x-csrf-token": csrf },
          data: { productName: "Conflicting product" },
        },
      );
      expect(conflict.status()).toBe(400);
      expect((await conflict.json()) as { code: string }).toMatchObject({
        code: "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
      });

      // Unassign the team and clear the budget through the UI.
      await reopened
        .getByRole("button", { name: `Unassign ${teamName}` })
        .click();
      await expect(reopened.getByText("No teams assigned.")).toBeVisible();
      await reopened
        .getByRole("button", { name: "Clear", exact: true })
        .click();
      await expect(
        reopened.getByText("Current: —", { exact: true }),
      ).toBeVisible();

      const clearedTeams = await queryInSchema(
        runDatabaseUrl(),
        `SELECT team_id FROM workspace_teams WHERE workspace_id = $1`,
        [created!.workspaceId],
      );
      expect(clearedTeams).toHaveLength(0);
      const clearedBudget = await queryInSchema<{
        budget_amount: string | null;
        budget_currency: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT budget_amount, budget_currency FROM campaigns WHERE id = $1`,
        [campaignId],
      );
      expect(clearedBudget).toEqual([
        { budget_amount: null, budget_currency: null },
      ]);

      // Remove the activity through the UI's inline confirm; progress
      // returns to "nothing counted yet."
      await reopened
        .getByRole("button", { name: `Remove ${activityName}` })
        .click();
      await reopened
        .getByRole("button", { name: `Confirm remove ${activityName}` })
        .click();
      await expect(
        reopened.getByText(activityName, { exact: true }),
      ).not.toBeVisible();
      await expect(
        reopened.getByText("No activities counted yet", { exact: true }),
      ).toBeVisible();
      const activitiesGone = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM campaign_activities WHERE campaign_id = $1`,
        [campaignId],
      );
      expect(activitiesGone).toHaveLength(0);

      // Delete the campaign through the inline confirm.
      await reopened.getByRole("button", { name: "Delete campaign" }).click();
      await reopened.getByRole("button", { name: "Confirm delete" }).click();

      await expect(
        page.getByText(campaignCount(baseline), { exact: true }),
      ).toBeVisible();
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const goneRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM campaigns WHERE id = $1`,
        [campaignId],
      );
      expect(goneRows).toHaveLength(0);
      // The campaign's connected workspace is removed with it.
      const workspaceGone = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM workspaces WHERE id = $1`,
        [created!.workspaceId],
      );
      expect(workspaceGone).toHaveLength(0);
      // The team it referenced survives; only the join row was removed.
      const teamStillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(teamStillThere).toHaveLength(1);
    });
  });

  test.describe("privileged but not omnipotent journey", () => {
    // Management/Administrator holds every campaign.* key at organization
    // scope except campaign.delete.
    test.use({ storageState: authStatePath("manager") });

    test("a manager can create, assign, transition, and budget but cannot delete a campaign", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);

      const campaignName = `E2E No Delete ${randomUUID().slice(0, 8)}`;
      const create = await page.request.post(`${apiBaseUrl}/api/v1/campaigns`, {
        headers: { "x-csrf-token": csrf },
        data: { name: campaignName, campaignType: "MARKETING" },
      });
      expect(create.status()).toBe(201);
      const campaignId = ((await create.json()) as { id: string }).id;

      // The manager can move the campaign and set its budget through the
      // API (the same routes the UI drives).
      const transition = await page.request.post(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}/transition`,
        { headers: { "x-csrf-token": csrf }, data: { status: "ACTIVE" } },
      );
      expect(transition.status()).toBe(200);
      const budget = await page.request.put(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}/budget`,
        {
          headers: { "x-csrf-token": csrf },
          data: { amount: 500, currency: "EUR" },
        },
      );
      expect(budget.status()).toBe(200);

      // The detail dialog offers no delete affordance for this account, but
      // the budget editor is present - the manager holds both budget keys,
      // only campaign.delete is absent.
      await page.goto("/campaigns");
      await page.getByRole("button", { name: campaignName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: campaignName }),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "Delete campaign" }),
      ).toHaveCount(0);
      await expect(
        detail.getByText("Current: 500.00 EUR", { exact: true }),
      ).toBeVisible();

      // Highest-risk failure path: a direct, correctly-formed delete is
      // refused with a stable code and the row survives.
      const blocked = await page.request.delete(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const stillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM campaigns WHERE id = $1`,
        [campaignId],
      );
      expect(stillThere).toHaveLength(1);

      // Clean up as an admin so the caption is not left inflated for reruns.
      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const adminCsrf = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      const cleanup = await admin.delete(
        `${apiBaseUrl}/api/v1/campaigns/${campaignId}`,
        { headers: { "x-csrf-token": adminCsrf as string } },
      );
      expect(cleanup.status()).toBe(204);
      await admin.dispose();
    });
  });

  test.describe("denied journey", () => {
    // A Department Manager holds campaign.read at DEPARTMENT scope only.
    // Campaign reads are organization-scoped, so the surface is fully
    // denied.
    test.use({ storageState: authStatePath("deptManager") });

    test("a department-scoped account cannot see, open, or drive campaign management", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Campaigns" })).toHaveCount(
        0,
      );

      await page.goto("/campaigns");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Filter by status" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New campaign" }),
      ).toHaveCount(0);

      const list = await page.request.get(`${apiBaseUrl}/api/v1/campaigns`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const deniedName = `E2E Denied ${randomUUID().slice(0, 8)}`;
      const attempt = await page.request.post(
        `${apiBaseUrl}/api/v1/campaigns`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { name: deniedName, campaignType: "MARKETING" },
        },
      );
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM campaigns WHERE name = $1`,
        [deniedName],
      );
      expect(leaked).toHaveLength(0);

      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
    });
  });
});
