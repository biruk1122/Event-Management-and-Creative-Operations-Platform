import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
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

/** The list caption renders `N department` / `N departments`. */
function departmentCount(total: number): string {
  return `${total} department${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

interface ApiDepartment {
  id: string;
  name: string;
  description: string | null;
  manager: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  employeeCount: number;
  deactivatedAt: string | null;
}

test.describe("Department administration — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates, edits, assigns a manager, deactivates, reloads, reactivates, and deletes a department", async ({
      page,
    }) => {
      // Retry-safe: a fresh name per attempt so a partial first run cannot
      // leave a `DEPARTMENT_NAME_CONFLICT` behind for the retry.
      const suffix = fixtureName("delivery");
      const dept = {
        name: `E2E Delivery ${suffix}`,
        description: "Owns delivery.",
        revisedDescription: "Owns delivery and release management.",
        manager: "super-admin@e2e.test",
      };

      // The account holds `department.read`, so the nav entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Departments" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/departments");

      await expect(
        page.getByRole("heading", { level: 1, name: "Departments" }),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/departments`);
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(departmentCount(baseline), { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "departments list");

      // Create a department through the dialog.
      await page.getByRole("button", { name: "New department" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New department" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create department dialog");
      await createDialog.getByLabel("Name").fill(dept.name);
      await createDialog
        .getByLabel("Description (optional)")
        .fill(dept.description);
      await createDialog
        .getByRole("button", { name: "Create department" })
        .click();

      // It lands in the list and in the authoritative store.
      await expect(
        page.getByText(departmentCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: dept.name })).toBeVisible();

      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/departments?search=${encodeURIComponent(dept.name)}`,
      );
      const created = (
        (await listAfterCreate.json()) as { items: ApiDepartment[] }
      ).items.find((department) => department.name === dept.name);
      expect(
        created,
        "created department should be readable from the API",
      ).toBeTruthy();
      const departmentId = created!.id;
      expect(created).toMatchObject({
        description: dept.description,
        manager: null,
        employeeCount: 0,
        deactivatedAt: null,
      });

      // The row exists in the isolated schema with the expected shape.
      const createdRows = await queryInSchema<{
        description: string | null;
        manager_id: string | null;
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT description, manager_id, deactivated_at
           FROM departments
          WHERE id = $1`,
        [departmentId],
      );
      expect(createdRows).toEqual([
        {
          description: dept.description,
          manager_id: null,
          deactivated_at: null,
        },
      ]);

      // Edit the description through the detail dialog.
      await page.getByRole("button", { name: dept.name }).click();
      const detailDialog = page.getByRole("dialog");
      await expect(
        detailDialog.getByRole("heading", { name: dept.name }),
      ).toBeVisible();
      await detailDialog
        .getByLabel("Description")
        .fill(dept.revisedDescription);
      await detailDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(
        detailDialog.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();

      // Assign a manager through the dialog's manager control.
      const managerCombobox = detailDialog.getByRole("combobox", {
        name: "Manager",
      });
      await managerCombobox.click();
      await page.getByRole("option", { name: dept.manager }).click();
      // The control reflects the settled mutation before we read the API.
      await expect(managerCombobox).toContainText(dept.manager);

      // Description edit and manager assignment are both authoritative.
      const afterEdits = await page.request.get(
        `${apiBaseUrl}/api/v1/departments/${departmentId}`,
      );
      expect((await afterEdits.json()) as ApiDepartment).toMatchObject({
        description: dept.revisedDescription,
        manager: { email: dept.manager },
      });
      const managerRows = await queryInSchema<{ manager_id: string | null }>(
        runDatabaseUrl(),
        `SELECT manager_id FROM departments WHERE id = $1`,
        [departmentId],
      );
      expect(managerRows[0]?.manager_id).not.toBeNull();

      // Deactivate the department through the inline confirm.
      await detailDialog
        .getByRole("button", { name: "Deactivate department" })
        .click();
      await detailDialog
        .getByRole("button", { name: "Confirm deactivate" })
        .click();
      await expect(
        detailDialog.getByRole("button", { name: "Reactivate department" }),
      ).toBeVisible();

      const afterDeactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/departments/${departmentId}`,
      );
      expect(
        ((await afterDeactivate.json()) as ApiDepartment).deactivatedAt,
      ).not.toBeNull();
      const deactivatedRows = await queryInSchema<{
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT deactivated_at FROM departments WHERE id = $1`,
        [departmentId],
      );
      expect(deactivatedRows[0]?.deactivated_at).not.toBeNull();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(departmentCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: dept.name }).click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByText("Inactive")).toBeVisible();
      await expect(
        reopened.getByRole("button", { name: "Reactivate department" }),
      ).toBeVisible();

      // Reactivate and confirm the store agrees.
      await reopened
        .getByRole("button", { name: "Reactivate department" })
        .click();
      await expect(
        reopened.getByRole("button", { name: "Deactivate department" }),
      ).toBeVisible();
      const afterReactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/departments/${departmentId}`,
      );
      expect((await afterReactivate.json()) as ApiDepartment).toMatchObject({
        deactivatedAt: null,
      });
      const reactivatedRows = await queryInSchema<{
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT deactivated_at FROM departments WHERE id = $1`,
        [departmentId],
      );
      expect(reactivatedRows[0]?.deactivated_at).toBeNull();

      // Delete the (employee-free) department through the inline confirm.
      await reopened.getByRole("button", { name: "Delete department" }).click();
      await reopened.getByRole("button", { name: "Confirm delete" }).click();

      await expect(
        page.getByText(departmentCount(baseline), { exact: true }),
      ).toBeVisible();
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/departments/${departmentId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const goneRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM departments WHERE id = $1`,
        [departmentId],
      );
      expect(goneRows).toHaveLength(0);
    });

    test("refuses to delete a department that still has an employee", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);
      const name = fixtureName("E2E Populated");

      const memberLookup = await page.request.get(
        `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent("member@e2e.test")}`,
      );
      const memberId = (
        (await memberLookup.json()) as {
          items: { id: string; email: string }[];
        }
      ).items.find((user) => user.email === "member@e2e.test")!.id;

      const create = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers: { "x-csrf-token": csrf }, data: { name } },
      );
      expect(create.status()).toBe(201);
      const populatedId = ((await create.json()) as ApiDepartment).id;

      const assign = await page.request.put(
        `${apiBaseUrl}/api/v1/departments/${populatedId}/employees/${memberId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(assign.status()).toBe(200);

      const blocked = await page.request.delete(
        `${apiBaseUrl}/api/v1/departments/${populatedId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "DEPARTMENT_IN_USE",
      });
      const stillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM departments WHERE id = $1`,
        [populatedId],
      );
      expect(stillThere).toHaveLength(1);

      // Free the member and remove the fixture so the caption is not inflated.
      await page.request.delete(
        `${apiBaseUrl}/api/v1/departments/${populatedId}/employees/${memberId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      const cleanup = await page.request.delete(
        `${apiBaseUrl}/api/v1/departments/${populatedId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(cleanup.status()).toBe(204);
    });
  });

  test.describe("denied journey", () => {
    // A management account that holds no `department.*` grant. `member`'s saved
    // session is invalidated by `auth-session.spec.ts` (runs earlier), so the
    // denied journey uses an account no other spec signs out.
    test.use({ storageState: authStatePath("manager") });

    const manager = testUser("manager");

    test("a management account cannot see, open, or drive department administration", async ({
      page,
    }) => {
      // The nav entry is not offered.
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Departments" })).toHaveCount(
        0,
      );

      // A direct visit renders the access gate, not the management UI.
      await page.goto("/departments");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New department" }),
      ).toHaveCount(0);

      // The API refuses the read.
      const list = await page.request.get(`${apiBaseUrl}/api/v1/departments`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const forbiddenName = fixtureName("manager-forbidden-department");
      const attempt = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { name: forbiddenName },
        },
      );
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM departments WHERE name = $1`,
        [forbiddenName],
      );
      expect(leaked).toHaveLength(0);

      // The account's own session is intact — this was authorization, not authentication.
      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
      expect((await me.json()) as { email: string }).toMatchObject({
        email: manager.email.toLowerCase(),
      });
    });
  });

  test.describe("department-scoped visibility", () => {
    // A Department Manager holds `department.read` at DEPARTMENT scope: the API
    // narrows every read to the caller's own department.
    test.use({ storageState: authStatePath("deptManager") });

    test("a Department Manager sees only their own department", async ({
      page,
    }) => {
      const suffix = fixtureName("scoped");
      const homeName = `Scoped Home ${suffix}`;
      const otherName = `Scoped Other ${suffix}`;

      // Build the fixture as the administrator over a throwaway API context.
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

      const home = await admin.post(`${apiBaseUrl}/api/v1/departments`, {
        headers: adminHeaders,
        data: { name: homeName },
      });
      expect(home.status()).toBe(201);
      const homeId = ((await home.json()) as ApiDepartment).id;

      const other = await admin.post(`${apiBaseUrl}/api/v1/departments`, {
        headers: adminHeaders,
        data: { name: otherName },
      });
      expect(other.status()).toBe(201);
      const otherId = ((await other.json()) as ApiDepartment).id;

      const assign = await admin.put(
        `${apiBaseUrl}/api/v1/departments/${homeId}/employees/${managerUserId}`,
        { headers: adminHeaders },
      );
      expect(assign.status()).toBe(200);
      await admin.dispose();

      // The Department Manager: nav entry offered, list limited to their own.
      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "Departments" }),
      ).toBeVisible();
      await page.goto("/departments");

      await expect(
        page.getByRole("heading", { level: 1, name: "Departments" }),
      ).toBeVisible();
      await expect(
        page.getByText(departmentCount(1), { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: homeName })).toBeVisible();
      await expect(page.getByRole("button", { name: otherName })).toHaveCount(
        0,
      );
      // No write affordances for a read-only, department-scoped caller.
      await expect(
        page.getByRole("button", { name: "New department" }),
      ).toHaveCount(0);

      // The list API agrees: exactly the caller's own department.
      const scopedList = await page.request.get(
        `${apiBaseUrl}/api/v1/departments`,
      );
      const scoped = (await scopedList.json()) as {
        items: ApiDepartment[];
        total: number;
      };
      expect(scoped.total).toBe(1);
      expect(scoped.items.map((department) => department.id)).toEqual([homeId]);

      // A direct read of a department outside the caller's scope is refused.
      const crossScope = await page.request.get(
        `${apiBaseUrl}/api/v1/departments/${otherId}`,
      );
      expect(crossScope.status()).toBe(403);
    });
  });
});
