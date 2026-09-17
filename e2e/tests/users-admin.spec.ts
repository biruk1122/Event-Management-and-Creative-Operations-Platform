import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
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

interface ApiUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileImage: string | null;
  status: "ACTIVE" | "INACTIVE";
  deactivatedAt: string | null;
  role: { id: string; name: string } | null;
  mustChangePassword: boolean;
}

test.describe("User administration — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    const NEW_USER = {
      email: "usr06.journey@e2e.test",
      firstName: "Usr06",
      lastName: "Journey",
      password: "e2e-Passw0rd!",
      phone: "+1 (555) 987-6543",
      profileImage: "avatars/usr06.png",
      role: "Team Member",
    };

    test("creates, edits, assigns a role, deactivates, reloads, and reactivates a user", async ({
      page,
    }, testInfo) => {
      const userEmail =
        testInfo.retry === 0
          ? NEW_USER.email
          : `usr06.journey.retry-${testInfo.retry}@e2e.test`;
      const userLastName =
        testInfo.retry === 0
          ? NEW_USER.lastName
          : `${NEW_USER.lastName} Retry ${testInfo.retry}`;
      const userDisplayName = `${NEW_USER.firstName} ${userLastName}`;

      // The account holds `user.read`, so the permission-aware nav entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Users" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/users");

      await expect(
        page.getByRole("heading", { level: 1, name: "Users" }),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/users`);
      expect(before.ok()).toBe(true);
      const baselineTotal = ((await before.json()) as { total: number }).total;
      await expect(page.getByText(`${baselineTotal} users`)).toBeVisible();
      await expectNoWcag22AaViolations(page, "users list");

      // Create a user through the dialog with an operator-set password.
      await page.getByRole("button", { name: "New user" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New user" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create user dialog");
      await createDialog.getByLabel("First name").fill(NEW_USER.firstName);
      await createDialog.getByLabel("Last name").fill(userLastName);
      await createDialog.getByLabel("Email").fill(userEmail);
      await createDialog
        .getByLabel("Temporary password")
        .fill(NEW_USER.password);
      await createDialog.getByRole("button", { name: "Create user" }).click();

      // Wait for the write's authoritative result before checking the
      // invalidated browser query. On busy CI runners the dialog's mutation
      // can settle one render before the list refetch paints its new total.
      let created: ApiUser | undefined;
      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(userEmail)}`,
            );
            if (!response.ok()) return null;
            const items = ((await response.json()) as { items: ApiUser[] })
              .items;
            created = items.find((user) => user.email === userEmail);
            return created?.id ?? null;
          },
          { timeout: 20_000 },
        )
        .not.toBeNull();

      // It lands in the list as well as the authoritative store.
      await expect(page.getByText(`${baselineTotal + 1} users`)).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole("button", {
          name: userDisplayName,
        }),
      ).toBeVisible({ timeout: 20_000 });

      expect(
        created,
        "created user should be readable from the API",
      ).toBeTruthy();
      const userId = created!.id;
      expect(created).toMatchObject({
        status: "ACTIVE",
        mustChangePassword: true,
        role: null,
      });

      // The credential the operator set is flagged for rotation in the database.
      const credentialRows = await queryInSchema<{
        must_change_password: boolean;
      }>(
        runDatabaseUrl(),
        `SELECT c.must_change_password
           FROM user_credentials c
          WHERE c.user_id = $1`,
        [userId],
      );
      expect(credentialRows).toEqual([{ must_change_password: true }]);

      // Edit profile fields through the detail dialog.
      await page
        .getByRole("button", {
          name: userDisplayName,
        })
        .click();
      const detailDialog = page.getByRole("dialog");
      await expect(
        detailDialog.getByRole("heading", {
          name: userDisplayName,
        }),
      ).toBeVisible();
      await detailDialog.getByLabel("Phone").fill(NEW_USER.phone);
      await detailDialog
        .getByLabel("Profile photo")
        .fill(NEW_USER.profileImage);
      await detailDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(
        detailDialog.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();

      // Assign a role through the dialog's role control.
      const roleCombobox = detailDialog.getByRole("combobox", {
        name: "Role",
        exact: true,
      });
      await roleCombobox.click();
      await page.getByRole("option", { name: NEW_USER.role }).click();
      // The control reflects the settled mutation before we read the API.
      await expect(roleCombobox).toContainText(NEW_USER.role);

      // Profile edit and role assignment are both authoritative.
      const afterEdits = await page.request.get(
        `${apiBaseUrl}/api/v1/users/${userId}`,
      );
      expect((await afterEdits.json()) as ApiUser).toMatchObject({
        phone: NEW_USER.phone,
        profileImage: NEW_USER.profileImage,
        role: { name: NEW_USER.role },
      });

      const assignmentRows = await queryInSchema<{ role_name: string }>(
        runDatabaseUrl(),
        `SELECT r.name AS role_name
           FROM user_role_assignments a
           JOIN roles r ON r.id = a.role_id
          WHERE a.user_id = $1`,
        [userId],
      );
      expect(assignmentRows).toEqual([{ role_name: NEW_USER.role }]);

      // Deactivate the user through the inline confirm.
      await detailDialog
        .getByRole("button", { name: "Deactivate user" })
        .click();
      await detailDialog
        .getByRole("button", { name: "Confirm deactivate" })
        .click();
      await expect(
        detailDialog.getByRole("button", { name: "Reactivate user" }),
      ).toBeVisible();

      // The transition persisted with a coherent timestamp (biconditional CHECK).
      const afterDeactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/users/${userId}`,
      );
      expect((await afterDeactivate.json()) as ApiUser).toMatchObject({
        status: "INACTIVE",
      });
      const deactivatedRows = await queryInSchema<{
        status: string;
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT status, deactivated_at FROM users WHERE id = $1`,
        [userId],
      );
      expect(deactivatedRows[0]?.status).toBe("INACTIVE");
      expect(deactivatedRows[0]?.deactivated_at).not.toBeNull();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(page.getByText(`${baselineTotal + 1} users`)).toBeVisible();
      await page
        .getByRole("button", {
          name: userDisplayName,
        })
        .click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByText("Inactive")).toBeVisible();
      await expect(
        reopened.getByRole("button", { name: "Reactivate user" }),
      ).toBeVisible();

      // Reactivate and confirm the store agrees the account is usable again.
      await reopened.getByRole("button", { name: "Reactivate user" }).click();
      await expect(
        reopened.getByRole("button", { name: "Deactivate user" }),
      ).toBeVisible();
      const afterReactivate = await page.request.get(
        `${apiBaseUrl}/api/v1/users/${userId}`,
      );
      expect((await afterReactivate.json()) as ApiUser).toMatchObject({
        status: "ACTIVE",
        deactivatedAt: null,
      });
      const reactivatedRows = await queryInSchema<{
        status: string;
        deactivated_at: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT status, deactivated_at FROM users WHERE id = $1`,
        [userId],
      );
      expect(reactivatedRows[0]).toMatchObject({
        status: "ACTIVE",
        deactivated_at: null,
      });

      // Filtering the list asks the API for the narrowed set and leaves only
      // the matching account, regardless of which rows pagination showed.
      await reopened.getByRole("button", { name: "Close" }).click();
      await page.getByLabel("Search").fill(userEmail);
      await expect(
        page.getByText("1 user match these filters", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: userDisplayName,
        }),
      ).toBeVisible();
    });
  });

  test.describe("denied journey", () => {
    // A management account that holds no `user.*` grant. `member`'s saved
    // session is invalidated by `auth-session.spec.ts` (runs earlier), so the
    // denied journey uses an account no other spec signs out.
    test.use({ storageState: authStatePath("manager") });

    const manager = testUser("manager");

    test("a management account cannot see, open, or drive user administration", async ({
      page,
    }) => {
      // The nav entry is not offered.
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

      // A direct visit renders the access gate, not the management UI.
      await page.goto("/users");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New user" })).toHaveCount(
        0,
      );

      // The API refuses the read.
      const list = await page.request.get(`${apiBaseUrl}/api/v1/users`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const forbiddenEmail = "manager-forbidden-user@e2e.test";
      const attempt = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: {
          email: forbiddenEmail,
          firstName: "Should",
          lastName: "NotExist",
          temporaryPassword: "e2e-Passw0rd!",
        },
      });
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM users WHERE email = $1`,
        [forbiddenEmail],
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
});
