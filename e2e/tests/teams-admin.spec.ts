import AxeBuilder from "@axe-core/playwright";
import { expect, request, test, type Page } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";
import { testUser } from "../fixtures/test-users.js";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

/** The list caption renders `N team` / `N teams`. */
function teamCount(total: number): string {
  return `${total} team${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

async function noSeriousAxeViolations(
  page: Page,
  context: string,
): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    `${context}: ${JSON.stringify(
      serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      null,
      2,
    )}`,
  ).toEqual([]);
}

interface ApiTeam {
  id: string;
  name: string;
  description: string | null;
  department: { id: string; name: string };
  manager: { id: string; email: string } | null;
  members: { id: string; email: string }[];
  deactivatedAt: string | null;
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

test.describe("Team administration — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates under a department, edits, assigns a manager, manages members, deactivates, reloads, reactivates, and deletes a team", async ({
      page,
    }) => {
      const suffix = fixtureName("delivery");
      const csrf = await csrfToken(page);
      const departmentName = `E2E Team Home ${suffix}`;
      const team = {
        name: `E2E Delivery Team ${suffix}`,
        description: "Delivers releases.",
        revisedDescription: "Delivers releases and hotfixes.",
        manager: "super-admin@e2e.test",
        member: "member@e2e.test",
      };

      // A team is department-owned, so create the owning department first.
      const departmentResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers: { "x-csrf-token": csrf }, data: { name: departmentName } },
      );
      expect(departmentResponse.status()).toBe(201);
      const departmentId = ((await departmentResponse.json()) as { id: string })
        .id;
      const memberId = await userIdByEmail(page, team.member);

      // The account holds `team.read`, so the nav entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Teams" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/teams");

      await expect(
        page.getByRole("heading", { level: 1, name: "Teams" }),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/teams`);
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(teamCount(baseline), { exact: true }),
      ).toBeVisible();
      await noSeriousAxeViolations(page, "teams list");

      // Create a team through the dialog, choosing its owning department.
      await page.getByRole("button", { name: "New team" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New team" }),
      ).toBeVisible();
      await noSeriousAxeViolations(page, "create team dialog");
      await createDialog.getByLabel("Name").fill(team.name);
      await createDialog.getByRole("combobox", { name: "Department" }).click();
      await page.getByRole("option", { name: departmentName }).click();
      await createDialog
        .getByLabel("Description (optional)")
        .fill(team.description);
      await createDialog.getByRole("button", { name: "Create team" }).click();

      // It lands in the list and in the authoritative store.
      await expect(
        page.getByText(teamCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: team.name })).toBeVisible();

      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/teams?search=${encodeURIComponent(team.name)}`,
      );
      const created = (
        (await listAfterCreate.json()) as { items: ApiTeam[] }
      ).items.find((candidate) => candidate.name === team.name);
      expect(
        created,
        "created team should be readable from the API",
      ).toBeTruthy();
      const teamId = created!.id;
      expect(created).toMatchObject({
        description: team.description,
        department: { id: departmentId, name: departmentName },
        manager: null,
        members: [],
        deactivatedAt: null,
      });

      const createdRows = await queryInSchema<{
        description: string | null;
        department_id: string;
        manager_id: string | null;
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT description, department_id, manager_id, deactivated_at
           FROM teams
          WHERE id = $1`,
        [teamId],
      );
      expect(createdRows).toEqual([
        {
          description: team.description,
          department_id: departmentId,
          manager_id: null,
          deactivated_at: null,
        },
      ]);

      // Edit the description through the detail dialog.
      await page.getByRole("button", { name: team.name }).click();
      const detailDialog = page.getByRole("dialog");
      await expect(
        detailDialog.getByRole("heading", { name: team.name }),
      ).toBeVisible();
      await detailDialog
        .getByLabel("Description")
        .fill(team.revisedDescription);
      await detailDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(
        detailDialog.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();

      // Assign a manager through the dialog's manager control.
      const managerCombobox = detailDialog.getByRole("combobox", {
        name: "Manager",
      });
      await managerCombobox.click();
      await page.getByRole("option", { name: team.manager }).click();
      await expect(managerCombobox).toContainText(team.manager);

      // Add a member through the member control, then read it back.
      await detailDialog.getByRole("combobox", { name: "Add member" }).click();
      await page.getByRole("option", { name: team.member }).click();
      const roster = detailDialog.getByRole("list", { name: "Team members" });
      await expect(roster).toContainText(team.member);

      const afterEdits = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
      );
      expect((await afterEdits.json()) as ApiTeam).toMatchObject({
        description: team.revisedDescription,
        manager: { email: team.manager },
        members: [{ email: team.member }],
      });
      const editedRows = await queryInSchema<{ manager_id: string | null }>(
        runDatabaseUrl(),
        `SELECT manager_id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(editedRows[0]?.manager_id).not.toBeNull();
      const membershipRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(membershipRows).toEqual([{ user_id: memberId }]);

      // Remove the member again.
      await detailDialog
        .getByRole("button", { name: `Remove ${team.member}` })
        .click();
      await expect(
        detailDialog.getByText("No members yet. Add one below."),
      ).toBeVisible();
      const clearedMembership = await queryInSchema(
        runDatabaseUrl(),
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(clearedMembership).toHaveLength(0);

      // Deactivate the team through the inline confirm.
      await detailDialog
        .getByRole("button", { name: "Deactivate team" })
        .click();
      await detailDialog
        .getByRole("button", { name: "Confirm deactivate" })
        .click();
      await expect(
        detailDialog.getByRole("button", { name: "Reactivate team" }),
      ).toBeVisible();

      const afterDeactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
      );
      expect(
        ((await afterDeactivate.json()) as ApiTeam).deactivatedAt,
      ).not.toBeNull();
      const deactivatedRows = await queryInSchema<{
        deactivated_at: string | null;
      }>(runDatabaseUrl(), `SELECT deactivated_at FROM teams WHERE id = $1`, [
        teamId,
      ]);
      expect(deactivatedRows[0]?.deactivated_at).not.toBeNull();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(teamCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: team.name }).click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByText("Inactive")).toBeVisible();
      await expect(
        reopened.getByRole("button", { name: "Reactivate team" }),
      ).toBeVisible();

      // Reactivate and confirm the store agrees.
      await reopened.getByRole("button", { name: "Reactivate team" }).click();
      await expect(
        reopened.getByRole("button", { name: "Deactivate team" }),
      ).toBeVisible();
      const afterReactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
      );
      expect((await afterReactivate.json()) as ApiTeam).toMatchObject({
        deactivatedAt: null,
      });
      const reactivatedRows = await queryInSchema<{
        deactivated_at: string | null;
      }>(runDatabaseUrl(), `SELECT deactivated_at FROM teams WHERE id = $1`, [
        teamId,
      ]);
      expect(reactivatedRows[0]?.deactivated_at).toBeNull();

      // Delete the (member-free) team through the inline confirm.
      await reopened.getByRole("button", { name: "Delete team" }).click();
      await reopened.getByRole("button", { name: "Confirm delete" }).click();

      await expect(
        page.getByText(teamCount(baseline), { exact: true }),
      ).toBeVisible();
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const goneRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(goneRows).toHaveLength(0);
    });

    test("refuses to delete a team that still has a member", async ({
      page,
    }) => {
      const suffix = fixtureName("populated");
      const csrf = await csrfToken(page);

      const department = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        {
          headers: { "x-csrf-token": csrf },
          data: { name: `E2E Populated Dept ${suffix}` },
        },
      );
      expect(department.status()).toBe(201);
      const departmentId = ((await department.json()) as { id: string }).id;
      const memberId = await userIdByEmail(page, "member@e2e.test");

      const create = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: { "x-csrf-token": csrf },
        data: { name: `E2E Populated Team ${suffix}`, departmentId },
      });
      expect(create.status()).toBe(201);
      const teamId = ((await create.json()) as ApiTeam).id;

      const addMember = await page.request.put(
        `${apiBaseUrl}/api/v1/teams/${teamId}/members/${memberId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(addMember.status()).toBe(200);

      const blocked = await page.request.delete(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "TEAM_IN_USE",
      });
      const stillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(stillThere).toHaveLength(1);
      const membership = await queryInSchema(
        runDatabaseUrl(),
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(membership).toEqual([{ user_id: memberId }]);

      // Free the member and remove the fixtures so the caption is not inflated.
      await page.request.delete(
        `${apiBaseUrl}/api/v1/teams/${teamId}/members/${memberId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      const cleanup = await page.request.delete(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(cleanup.status()).toBe(204);
    });
  });

  test.describe("denied journey", () => {
    // A management account that holds no `team.*` read/write grant. `member`'s
    // saved session is invalidated by `auth-session.spec.ts` (runs earlier),
    // so the denied journey uses an account no other spec signs out.
    test.use({ storageState: authStatePath("manager") });

    const manager = testUser("manager");

    test("a management account cannot see, open, or drive team administration", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Teams" })).toHaveCount(0);

      await page.goto("/teams");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New team" })).toHaveCount(
        0,
      );

      const list = await page.request.get(`${apiBaseUrl}/api/v1/teams`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const forbiddenName = fixtureName("manager-forbidden-team");
      const attempt = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: {
          name: forbiddenName,
          departmentId: "00000000-0000-0000-0000-000000000000",
        },
      });
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM teams WHERE name = $1`,
        [forbiddenName],
      );
      expect(leaked).toHaveLength(0);

      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
      expect((await me.json()) as { email: string }).toMatchObject({
        email: manager.email.toLowerCase(),
      });
    });
  });

  test.describe("department-scoped visibility", () => {
    // A Department Manager holds `team.read` at DEPARTMENT scope: the API
    // narrows every read to teams owned by the caller's own department.
    test.use({ storageState: authStatePath("deptManager") });

    test("a Department Manager sees only their own department's teams", async ({
      page,
    }) => {
      const suffix = fixtureName("scoped");
      const homeDeptName = `Scoped Team Home ${suffix}`;
      const otherDeptName = `Scoped Team Other ${suffix}`;
      const homeTeamName = `Scoped Home Team ${suffix}`;
      const otherTeamName = `Scoped Other Team ${suffix}`;

      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const adminCsrf = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      expect(
        adminCsrf,
        "admin csrf_token cookie should be present",
      ).toBeTruthy();
      const adminHeaders = { "x-csrf-token": adminCsrf as string };

      const managerLookup = await admin.get(
        `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent("dept-manager@e2e.test")}`,
      );
      const managerUserId = (
        (await managerLookup.json()) as {
          items: { id: string; email: string }[];
        }
      ).items.find((user) => user.email === "dept-manager@e2e.test")!.id;

      const homeDept = await admin.post(`${apiBaseUrl}/api/v1/departments`, {
        headers: adminHeaders,
        data: { name: homeDeptName },
      });
      expect(homeDept.status()).toBe(201);
      const homeDeptId = ((await homeDept.json()) as { id: string }).id;

      const otherDept = await admin.post(`${apiBaseUrl}/api/v1/departments`, {
        headers: adminHeaders,
        data: { name: otherDeptName },
      });
      expect(otherDept.status()).toBe(201);
      const otherDeptId = ((await otherDept.json()) as { id: string }).id;

      const assign = await admin.put(
        `${apiBaseUrl}/api/v1/departments/${homeDeptId}/employees/${managerUserId}`,
        { headers: adminHeaders },
      );
      expect(assign.status()).toBe(200);

      const homeTeam = await admin.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: adminHeaders,
        data: { name: homeTeamName, departmentId: homeDeptId },
      });
      expect(homeTeam.status()).toBe(201);
      const homeTeamId = ((await homeTeam.json()) as ApiTeam).id;

      const otherTeam = await admin.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: adminHeaders,
        data: { name: otherTeamName, departmentId: otherDeptId },
      });
      expect(otherTeam.status()).toBe(201);
      const otherTeamId = ((await otherTeam.json()) as ApiTeam).id;
      await admin.dispose();

      await page.goto("/");
      await expect(page.getByRole("link", { name: "Teams" })).toBeVisible();
      await page.goto("/teams");

      await expect(
        page.getByRole("heading", { level: 1, name: "Teams" }),
      ).toBeVisible();
      await expect(page.getByText(teamCount(1), { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: homeTeamName }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: otherTeamName }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New team" })).toHaveCount(
        0,
      );

      const scopedList = await page.request.get(`${apiBaseUrl}/api/v1/teams`);
      const scoped = (await scopedList.json()) as {
        items: ApiTeam[];
        total: number;
      };
      expect(scoped.total).toBe(1);
      expect(scoped.items.map((item) => item.id)).toEqual([homeTeamId]);

      const crossScope = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${otherTeamId}`,
      );
      expect(crossScope.status()).toBe(403);
    });
  });
});
