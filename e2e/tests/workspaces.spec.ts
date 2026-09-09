import { expect, test, type Page } from "@playwright/test";

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

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

async function userIdByEmail(page: Page, email: string): Promise<string> {
  const response = await page.request.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
  const user = (
    (await response.json()) as { items: { id: string; email: string }[] }
  ).items.find((candidate) => candidate.email === email);
  expect(user, `seeded user ${email} should be readable`).toBeTruthy();
  return user!.id;
}

interface Workspace {
  id: string;
  kind: string;
  manager: { id: string; email: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string; email: string }[];
}

test.describe("Connected workspace ownership — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates an event workspace, assigns its people and team, persists through reload, and deletes it", async ({
      page,
    }, testInfo) => {
      // A retry runs in a fresh worker, resetting fixtureName's sequence while
      // a failed prior attempt may have left setup resources behind.
      const suffix = `${fixtureName("workspace")}-retry-${testInfo.retry}`;
      const csrf = await csrfToken(page);
      const teamName = `E2E Workspace Team ${suffix}`;
      const managerEmail = "super-admin@e2e.test";
      const participantEmail = "member@e2e.test";
      const managerId = await userIdByEmail(page, managerEmail);
      const participantId = await userIdByEmail(page, participantEmail);

      // Workspace ownership is tested through its UI; the required department
      // and team are created through their already-validated administrative API.
      const department = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        {
          headers: { "x-csrf-token": csrf },
          data: { name: `E2E Workspace Department ${suffix}` },
        },
      );
      expect(department.status()).toBe(201);
      const departmentId = ((await department.json()) as { id: string }).id;

      const team = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: { "x-csrf-token": csrf },
        data: { name: teamName, departmentId },
      });
      expect(team.status()).toBe(201);
      const teamId = ((await team.json()) as { id: string }).id;
      const assignableTeams = await page.request.get(
        `${apiBaseUrl}/api/v1/teams?pageSize=100`,
      );
      expect(assignableTeams.ok()).toBe(true);
      expect(
        (
          (await assignableTeams.json()) as { items: { id: string }[] }
        ).items.some((candidate) => candidate.id === teamId),
      ).toBe(true);

      const before = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT`,
      );
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;

      await page.goto("/");
      const navigation = page.getByRole("link", { name: "Workspaces" });
      await expect(navigation).toBeVisible();
      await navigation.click();
      await expect(page).toHaveURL("/workspaces");
      await expect(
        page.getByRole("heading", { level: 1, name: "Workspaces" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "workspaces list");

      // The list is per kind, so explicitly select the event flow under test.
      const kind = page.getByRole("combobox", { name: "Workspace kind" });
      await kind.click();
      await page.getByRole("option", { name: "Event", exact: true }).click();
      await expect(
        page.getByText(`${baseline} workspace${baseline === 1 ? "" : "s"}`, {
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "New workspace" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New Event workspace" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create workspace dialog");
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page.getByRole("option", { name: managerEmail }).click();
      await createDialog
        .getByRole("button", { name: "Create workspace" })
        .click();

      await expect(
        page.getByText(
          `${baseline + 1} workspace${baseline + 1 === 1 ? "" : "s"}`,
          { exact: true },
        ),
      ).toBeVisible();
      const row = page.getByRole("button", {
        name: `Event workspace managed by ${managerEmail}`,
      });
      await expect(row).toBeVisible();

      const afterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT`,
      );
      const workspace = (
        (await afterCreate.json()) as { items: Workspace[] }
      ).items.find((candidate) => candidate.manager?.id === managerId);
      expect(
        workspace,
        "created workspace should be readable from the API",
      ).toBeTruthy();
      const workspaceId = workspace!.id;
      expect(workspace).toMatchObject({
        kind: "EVENT",
        manager: { id: managerId, email: managerEmail },
        teams: [],
        participants: [],
      });

      // The root, manager, and explicit joins are authoritative PostgreSQL data.
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT kind, manager_id FROM workspaces WHERE id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([{ kind: "EVENT", manager_id: managerId }]);

      await row.click();
      const detailDialog = page.getByRole("dialog");
      await expect(
        detailDialog.getByRole("heading", { name: "Event workspace" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "workspace detail dialog");

      const teamPicker = detailDialog.getByRole("combobox", {
        name: "Assign a team",
      });
      await expect(teamPicker).toBeVisible();
      await teamPicker.click();
      await page.getByRole("option", { name: teamName }).click();
      await expect(
        detailDialog.getByText(teamName, { exact: true }),
      ).toBeVisible();

      const participantPicker = detailDialog.getByRole("combobox", {
        name: "Add a participant",
      });
      await expect(participantPicker).toBeVisible();
      await participantPicker.click();
      await page.getByRole("option", { name: participantEmail }).click();
      await expect(
        detailDialog.getByText(participantEmail, { exact: true }),
      ).toBeVisible();

      const persisted = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
      );
      expect(persisted.ok()).toBe(true);
      expect((await persisted.json()) as Workspace).toMatchObject({
        id: workspaceId,
        kind: "EVENT",
        manager: { id: managerId, email: managerEmail },
        teams: [{ id: teamId, name: teamName }],
        participants: [{ id: participantId, email: participantEmail }],
      });
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT team_id FROM workspace_teams WHERE workspace_id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([{ team_id: teamId }]);
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT user_id FROM workspace_participants WHERE workspace_id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([{ user_id: participantId }]);

      // AC: a fresh UI load reads the persisted root and its explicit joins.
      await page.reload();
      const reloadedRow = page.getByRole("button", {
        name: `Event workspace managed by ${managerEmail}`,
      });
      await expect(reloadedRow).toBeVisible();
      await reloadedRow.click();
      const reloadedDialog = page.getByRole("dialog");
      await expect(
        reloadedDialog.getByRole("combobox", { name: "Manager" }),
      ).toContainText(managerEmail);
      await expect(
        reloadedDialog.getByText(teamName, { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedDialog.getByText(participantEmail, { exact: true }),
      ).toBeVisible();

      await reloadedDialog
        .getByRole("button", { name: "Delete workspace" })
        .click();
      await reloadedDialog
        .getByRole("button", { name: "Confirm delete" })
        .click();
      await expect(
        page.getByText(`${baseline} workspace${baseline === 1 ? "" : "s"}`, {
          exact: true,
        }),
      ).toBeVisible();
      const removed = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces/${workspaceId}`,
      );
      expect(removed.status()).toBe(404);
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT id FROM workspaces WHERE id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([]);
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT workspace_id FROM workspace_teams WHERE workspace_id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([]);
      await expect(
        queryInSchema(
          runDatabaseUrl(),
          `SELECT workspace_id FROM workspace_participants WHERE workspace_id = $1`,
          [workspaceId],
        ),
      ).resolves.toEqual([]);
    });
  });

  test.describe("denied journey", () => {
    // The member storage state is intentionally revoked by auth-session.spec.
    // A Department Manager has only department-scoped event/project/campaign
    // access, so it remains authenticated while being denied this
    // organization-scoped workspace surface.
    test.use({ storageState: authStatePath("deptManager") });

    test("a department-scoped user cannot see or create an event workspace", async ({
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
        page.getByRole("button", { name: "New workspace" }),
      ).toHaveCount(0);

      const list = await page.request.get(
        `${apiBaseUrl}/api/v1/workspaces?kind=EVENT`,
      );
      expect(list.status()).toBe(403);

      const before = await queryInSchema<{ count: string }>(
        runDatabaseUrl(),
        `SELECT count(*)::text AS count FROM workspaces WHERE kind = 'EVENT'`,
      );
      const attempt = await page.request.post(
        `${apiBaseUrl}/api/v1/workspaces`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { kind: "EVENT" },
        },
      );
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const after = await queryInSchema<{ count: string }>(
        runDatabaseUrl(),
        `SELECT count(*)::text AS count FROM workspaces WHERE kind = 'EVENT'`,
      );
      expect(after).toEqual(before);
    });
  });
});
