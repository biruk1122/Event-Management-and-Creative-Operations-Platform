import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";
import { testUser } from "../fixtures/test-users.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

/** The list caption renders `N workspace` / `N workspaces`. */
function workspaceCount(total: number): string {
  return `${total} workspace${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

interface ApiWorkspace {
  id: string;
  kind: string;
  manager: { id: string; email: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string; email: string }[];
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

test.describe("Connected workspace ownership — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates an event workspace, assigns a manager, a team, and a participant, reloads authoritative data, then removes and deletes", async ({
      page,
    }) => {
      // A random tail on top of the run-scoped name so a Playwright retry,
      // which restarts the fixture sequence in a fresh worker, cannot collide
      // with the failed attempt's still-present department.
      const suffix = `${fixtureName("connected")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const departmentName = `E2E WS Dept ${suffix}`;
      const teamName = `E2E WS Team ${suffix}`;
      const managerEmail = "member@e2e.test";
      const participantEmail = "manager@e2e.test";

      // A team is department-owned, so create the owning department and team
      // through the API before driving the workspace UI.
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
      const managerId = await userIdByEmail(page, managerEmail);
      const participantId = await userIdByEmail(page, participantEmail);

      // The account holds every module read at organization scope, so the nav
      // entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Workspaces" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/workspaces");

      await expect(
        page.getByRole("heading", { level: 1, name: "Workspaces" }),
      ).toBeVisible();
      // The default kind for a Super Admin is EVENT.
      await expect(
        page.getByRole("combobox", { name: "Workspace kind" }),
      ).toContainText("Event");

      // The list renders from authoritative API data.
      const before = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT`,
      );
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(workspaceCount(baseline), { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "workspaces list");

      // Create an EVENT workspace through the dialog.
      await page.getByRole("button", { name: "New workspace" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New Event workspace" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create workspace dialog");
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page
        .getByRole("option", { name: managerEmail, exact: true })
        .click();
      await createDialog
        .getByRole("button", { name: "Create workspace" })
        .click();

      await expect(
        page.getByText(workspaceCount(baseline + 1), { exact: true }),
      ).toBeVisible();

      // Find the new workspace in the authoritative store.
      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT&managerId=${managerId}`,
      );
      const created = (
        (await listAfterCreate.json()) as { items: ApiWorkspace[] }
      ).items[0];
      expect(created, "created workspace should be readable").toBeTruthy();
      const workspaceId = created!.id;
      expect(created).toMatchObject({
        kind: "EVENT",
        manager: { id: managerId },
        teams: [],
        participants: [],
      });

      const createdRows = await queryInSchema<{
        kind: string;
        manager_id: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT kind, manager_id FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
      expect(createdRows).toEqual([{ kind: "EVENT", manager_id: managerId }]);

      // Open the detail dialog and assign the team. (The list renders both a
      // desktop row and a mobile card; only one is in the a11y tree at the
      // test viewport, but `.first()` keeps this stable regardless.)
      await page
        .getByRole("button", {
          name: `Event workspace managed by ${managerEmail}`,
        })
        .first()
        .click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: "Event workspace" }),
      ).toBeVisible();

      await detail.getByRole("combobox", { name: "Assign a team" }).click();
      await page.getByRole("option", { name: teamName, exact: true }).click();
      await expect(detail.getByText(teamName, { exact: true })).toBeVisible();

      // Add a participant.
      await detail.getByRole("combobox", { name: "Add a participant" }).click();
      await page
        .getByRole("option", { name: participantEmail, exact: true })
        .click();
      await expect(
        detail.getByText(participantEmail, { exact: true }),
      ).toBeVisible();

      const afterAssignments = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
      );
      expect((await afterAssignments.json()) as ApiWorkspace).toMatchObject({
        teams: [{ id: teamId }],
        participants: [{ id: participantId }],
      });
      const joinRows = await queryInSchema<{ team_id: string }>(
        runDatabaseUrl(),
        `SELECT team_id FROM workspace_teams WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(joinRows).toEqual([{ team_id: teamId }]);
      const participantRows = await queryInSchema<{ user_id: string }>(
        runDatabaseUrl(),
        `SELECT user_id FROM workspace_participants WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(participantRows).toEqual([{ user_id: participantId }]);

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(workspaceCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: `Event workspace managed by ${managerEmail}`,
        })
        .first()
        .click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByText(teamName, { exact: true })).toBeVisible();
      await expect(
        reopened.getByText(participantEmail, { exact: true }),
      ).toBeVisible();

      // Unassign the team and remove the participant through the UI.
      await reopened
        .getByRole("button", { name: `Unassign ${teamName}` })
        .click();
      await expect(reopened.getByText("No teams assigned.")).toBeVisible();
      await reopened
        .getByRole("button", { name: `Remove ${participantEmail}` })
        .click();
      await expect(
        reopened.getByText("No individual participants."),
      ).toBeVisible();

      const clearedTeams = await queryInSchema(
        runDatabaseUrl(),
        `SELECT team_id FROM workspace_teams WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(clearedTeams).toHaveLength(0);
      const clearedParticipants = await queryInSchema(
        runDatabaseUrl(),
        `SELECT user_id FROM workspace_participants WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(clearedParticipants).toHaveLength(0);

      // Delete the workspace through the inline confirm.
      await reopened.getByRole("button", { name: "Delete workspace" }).click();
      await reopened.getByRole("button", { name: "Confirm delete" }).click();

      await expect(
        page.getByText(workspaceCount(baseline), { exact: true }),
      ).toBeVisible();
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const goneRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
      expect(goneRows).toHaveLength(0);
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
    // Management/Administrator holds event.create and event.assign_* at
    // organization scope, but not event.delete.
    test.use({ storageState: authStatePath("manager") });

    test("a manager can create and assign but cannot delete a workspace", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);

      await page.goto("/workspaces");
      await expect(
        page.getByRole("heading", { level: 1, name: "Workspaces" }),
      ).toBeVisible();

      const create = await page.request.post(
        `${apiBaseUrl}/api/v1/workspaces`,
        { headers: { "x-csrf-token": csrf }, data: { kind: "EVENT" } },
      );
      expect(create.status()).toBe(201);
      const workspaceId = ((await create.json()) as { id: string }).id;

      // The detail dialog offers no delete affordance for this account.
      await page.reload();
      await page
        .getByRole("button", { name: `Event workspace, no manager` })
        .first()
        .click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: "Event workspace" }),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "Delete workspace" }),
      ).toHaveCount(0);

      // Highest-risk failure path: a direct, correctly-formed delete is
      // refused with a stable code and the row survives.
      const blocked = await page.request.delete(
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const stillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM workspaces WHERE id = $1`,
        [workspaceId],
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
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
        { headers: { "x-csrf-token": adminCsrf as string } },
      );
      expect(cleanup.status()).toBe(204);
      await admin.dispose();
    });
  });

  test.describe("denied journey", () => {
    // A Department Manager holds event/project/campaign read at DEPARTMENT
    // scope only. Workspace reads are organization-scoped, so the surface is
    // fully denied.
    test.use({ storageState: authStatePath("deptManager") });

    const deptManager = testUser("deptManager");

    test("a department-scoped account cannot see, open, or drive workspace ownership", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Workspaces" })).toHaveCount(
        0,
      );

      await page.goto("/workspaces");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Workspace kind" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New workspace" }),
      ).toHaveCount(0);

      const list = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT`,
      );
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const attempt = await page.request.post(
        `${apiBaseUrl}/api/v1/workspaces`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { kind: "EVENT", managerId: MISSING_UUID },
        },
      );
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM workspaces WHERE manager_id = $1`,
        [MISSING_UUID],
      );
      expect(leaked).toHaveLength(0);

      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
      expect((await me.json()) as { email: string }).toMatchObject({
        email: deptManager.email.toLowerCase(),
      });
    });
  });
});
