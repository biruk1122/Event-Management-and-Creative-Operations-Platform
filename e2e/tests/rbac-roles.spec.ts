import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
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

test.describe("RBAC — configurable roles and permissions", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    const ROLE_NAME = "E2E Coordinator";
    const RENAMED = "E2E Coordinator (renamed)";

    test("creates, grants, persists across reload, renames, and deletes a role", async ({
      page,
    }) => {
      // The account holds `role.read`, so the account-menu entry is offered.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Roles and permissions" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/settings/roles");

      // The management surface renders from real API data (the five seeded roles).
      await expect(
        page.getByRole("heading", { level: 1, name: "Roles and permissions" }),
      ).toBeVisible();
      await expect(page.getByLabel("Search roles")).toBeVisible();
      await expect(page.getByText("5 roles")).toBeVisible();
      await noSeriousAxeViolations(page, "roles list");

      // Create a role through the dialog.
      await page.getByRole("button", { name: "New role" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New role" }),
      ).toBeVisible();
      await noSeriousAxeViolations(page, "create role dialog");
      await createDialog.getByLabel("Name", { exact: true }).fill(ROLE_NAME);
      await createDialog
        .getByLabel("Description", { exact: true })
        .fill("Created by the RBAC end-to-end journey.");
      await createDialog.getByRole("button", { name: "Create role" }).click();

      // It lands in the list and in the authoritative store.
      await expect(page.getByText("6 roles")).toBeVisible();
      const rolesList = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
      expect(rolesList.ok()).toBe(true);
      const created = (
        (await rolesList.json()) as { id: string; name: string }[]
      ).find((role) => role.name === ROLE_NAME);
      expect(
        created,
        "created role should be readable from the API",
      ).toBeTruthy();
      const roleId = created!.id;

      // Grant a permission at organization scope through the editor.
      await page.getByRole("button", { name: ROLE_NAME }).click();
      const detailDialog = page.getByRole("dialog");
      await expect(
        detailDialog.getByRole("heading", { name: ROLE_NAME }),
      ).toBeVisible();
      await detailDialog.getByLabel("Search permissions").fill("event.read");
      await detailDialog
        .getByRole("button", { name: "Grant event.read at Organization scope" })
        .click();
      // The optimistic-free flow reflects the server after the mutation settles.
      await expect(
        detailDialog.getByRole("button", {
          name: "Revoke event.read at Organization scope",
        }),
      ).toBeVisible();

      // The grant is authoritative: visible via the API and present in the row store.
      const withGrants = await page.request.get(
        `${apiBaseUrl}/api/v1/roles/${roleId}`,
      );
      expect(withGrants.ok()).toBe(true);
      expect((await withGrants.json()) as { grants: unknown[] }).toMatchObject({
        grants: expect.arrayContaining([
          { permissionKey: "event.read", scope: "ORGANIZATION" },
        ]),
      });
      const grantRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT permission_key, scope FROM role_permissions WHERE role_id = $1`,
        [roleId],
      );
      expect(grantRows).toContainEqual({
        permission_key: "event.read",
        scope: "ORGANIZATION",
      });

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(page.getByText("6 roles")).toBeVisible();
      await page.getByRole("button", { name: ROLE_NAME }).click();
      const reopened = page.getByRole("dialog");
      await reopened.getByLabel("Search permissions").fill("event.read");
      await expect(
        reopened.getByRole("button", {
          name: "Revoke event.read at Organization scope",
        }),
      ).toBeVisible();

      // Rename it and confirm the new name is authoritative.
      const nameField = reopened.getByLabel("Name", { exact: true });
      await nameField.fill(RENAMED);
      await reopened.getByRole("button", { name: "Save changes" }).click();
      await expect(
        reopened.getByRole("heading", { name: RENAMED }),
      ).toBeVisible();
      await reopened.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("button", { name: RENAMED })).toBeVisible();
      const afterRename = await page.request.get(
        `${apiBaseUrl}/api/v1/roles/${roleId}`,
      );
      expect((await afterRename.json()) as { name: string }).toMatchObject({
        name: RENAMED,
      });

      // Delete it and confirm it is gone everywhere.
      await page.getByRole("button", { name: RENAMED }).click();
      const toDelete = page.getByRole("dialog");
      await toDelete.getByRole("button", { name: "Delete role" }).click();
      await toDelete.getByRole("button", { name: "Confirm delete" }).click();
      await expect(page.getByText("5 roles")).toBeVisible();
      await expect(page.getByRole("button", { name: RENAMED })).toHaveCount(0);
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/roles/${roleId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const deletedRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM roles WHERE id = $1`,
        [roleId],
      );
      expect(deletedRows).toHaveLength(0);
    });
  });

  test.describe("denied journey", () => {
    // A management account that still holds no `role.*` grant. `member`'s saved
    // session is invalidated by `auth-session.spec.ts` (which runs earlier),
    // so this journey needs an account no other spec signs out.
    test.use({ storageState: authStatePath("manager") });

    const manager = testUser("manager");

    test("a management account cannot see, open, or drive role administration", async ({
      page,
    }) => {
      // The account-menu entry is not offered.
      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "Roles and permissions" }),
      ).toHaveCount(0);

      // A direct visit renders the access gate, not the management UI.
      await page.goto("/settings/roles");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(page.getByLabel("Search roles")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New role" })).toHaveCount(
        0,
      );

      // The API refuses the read.
      const list = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const attempt = await page.request.post(`${apiBaseUrl}/api/v1/roles`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: { name: "manager-forbidden-role", description: "" },
      });
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM roles WHERE name = $1`,
        ["manager-forbidden-role"],
      );
      expect(leaked).toHaveLength(0);

      // The account's own session is still healthy — this was authorization, not authentication.
      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
      expect((await me.json()) as { email: string }).toMatchObject({
        email: manager.email.toLowerCase(),
      });
    });
  });
});
