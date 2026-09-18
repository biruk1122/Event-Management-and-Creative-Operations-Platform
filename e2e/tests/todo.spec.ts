import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

function runDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("The E2E harness should provide DATABASE_URL.");
  return value;
}

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "csrf token should be present").toBeTruthy();
  return token as string;
}

/** `POST /api/v1/users` grants baseline-only access unless a `roleId` is
 * given explicitly - so a disposable "Team Member" account needs this
 * looked up and passed at creation time. */
async function roleIdByName(
  requester: Pick<Page, "request">,
  name: string,
): Promise<string> {
  const response = await requester.request.get(`${apiBaseUrl}/api/v1/roles`);
  expect(response.ok()).toBe(true);
  const roles = (await response.json()) as { id: string; name: string }[];
  const role = roles.find((candidate) => candidate.name === name);
  expect(role, `role "${name}" should exist`).toBeTruthy();
  return role!.id;
}

interface DisposableUser {
  email: string;
}

/** Creates a disposable "Team Member" account through the real API - a
 * clean, unrelated to-do owner rather than the shared `member` fixture
 * (already signed out elsewhere in the suite by auth-session.spec.ts),
 * matching calendar.spec.ts's own convention. */
async function createDisposableUser(
  page: Page,
  csrf: string,
  label: string,
): Promise<DisposableUser> {
  const suffix = randomUUID().slice(0, 8);
  const email = `todo-${label}-${suffix}@e2e.test`;
  const teamMemberRoleId = await roleIdByName(page, "Team Member");
  const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": csrf },
    data: {
      email,
      firstName: "Todo",
      lastName: `${label} ${suffix}`,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId: teamMemberRoleId,
    },
  });
  expect(created.status()).toBe(201);
  return { email };
}

/** Today as a bare `YYYY-MM-DD` - the "Due date" field's shape, and what
 * puts a created item under the My Day view (the page's default) without
 * needing to switch views first. */
function todayDateOnly(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A `datetime-local` value for "today", for the reminder field. */
function todayAt(hour: number, minute = 0): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(hour)}:${pad(minute)}`;
}

test.describe("Personal To-Do and reminders — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates a to-do with a reminder, persists across reload, completes, edits, and deletes it through the real API", async ({
      page,
    }) => {
      // Create, three reloads, a complete toggle, an edit, and a delete,
      // each a real round trip.
      test.setTimeout(60_000);
      const title = `E2E Todo ${randomUUID().slice(0, 8)}`;
      const updatedTitle = `${title} (updated)`;

      await page.goto("/todos");
      await expect(
        page.getByRole("heading", { level: 1, name: "To-Do" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "todos page, empty");

      await page.getByRole("button", { name: "Add to-do" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New to-do" }),
      ).toBeVisible();
      await createDialog.getByLabel("Title").fill(title);
      await createDialog
        .getByLabel("Description")
        .fill("Created by the to-do end-to-end suite.");
      await createDialog
        .getByLabel("Due date (optional)")
        .fill(todayDateOnly());
      await createDialog.getByRole("checkbox", { name: "Remind me" }).check();
      await createDialog
        .getByLabel("Reminder time", { exact: true })
        .fill(todayAt(8, 0));
      await createDialog.getByRole("button", { name: "Create to-do" }).click();
      await expect(createDialog).toBeHidden();

      const itemText = page.getByText(title, { exact: true });
      await expect(itemText).toBeVisible();
      await expectNoWcag22AaViolations(page, "todos page, with an item");

      // Reload proves REST persistence, not client cache.
      await page.reload();
      await expect(page.getByText(title, { exact: true })).toBeVisible();

      // Complete: the list's one-click toggle is a real PATCH, not local
      // state - it must survive a reload, and the item must move to the
      // Completed view.
      await page
        .getByRole("button", { name: `Mark "${title}" as completed` })
        .click();
      await page.reload();
      await page.getByRole("button", { name: "Completed" }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: `Mark "${title}" as not started` })
        .click();
      await page.getByRole("button", { name: "My Day" }).click();

      // Edit: type is mutable via PATCH for a to-do (unlike Calendar's
      // PERSONAL/REMINDER), so no field is disabled here.
      await page.getByText(title, { exact: true }).click();
      const editDialog = page.getByRole("dialog");
      await expect(
        editDialog.getByRole("heading", { name: "Edit to-do" }),
      ).toBeVisible();
      await editDialog.getByLabel("Title").fill(updatedTitle);
      await editDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(editDialog).toBeHidden();
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

      // Reload again: the edit is authoritative, not just an optimistic
      // local update.
      await page.reload();
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(title, { exact: true })).not.toBeVisible();

      // Delete, then confirm through both the UI and the database directly.
      await page.getByText(updatedTitle, { exact: true }).click();
      const deleteDialog = page.getByRole("dialog");
      await deleteDialog.getByRole("button", { name: "Delete" }).click();
      await expect(deleteDialog).toBeHidden();
      await expect(
        page.getByText(updatedTitle, { exact: true }),
      ).not.toBeVisible();

      const rows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM todos WHERE title = $1`,
        [updatedTitle],
      );
      expect(rows).toHaveLength(0);
    });
  });

  test.describe("isolation journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a user's to-do items are never visible to, or reachable by, another user", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const userA = await createDisposableUser(page, csrf, "isolation-a");
      const userB = await createDisposableUser(page, csrf, "isolation-b");
      const titleA = `E2E Todo Isolation A ${randomUUID().slice(0, 8)}`;

      const pageA = await browser.newPage();
      const pageB = await browser.newPage();
      try {
        await signInThroughUi(pageA, {
          key: "todo-isolation-a",
          email: userA.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Todo",
          lastName: "Isolation A",
        });
        await signInThroughUi(pageB, {
          key: "todo-isolation-b",
          email: userB.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Todo",
          lastName: "Isolation B",
        });

        await pageA.goto("/todos");
        await pageA.getByRole("button", { name: "Add to-do" }).click();
        const dialogA = pageA.getByRole("dialog");
        await dialogA.getByLabel("Title").fill(titleA);
        await dialogA.getByLabel("Due date (optional)").fill(todayDateOnly());
        await dialogA.getByRole("button", { name: "Create to-do" }).click();
        await expect(dialogA).toBeHidden();
        const listResponse = await pageA.request.get(
          `${apiBaseUrl}/api/v1/todos`,
        );
        expect(listResponse.ok()).toBe(true);
        const itemId = (
          (await listResponse.json()) as {
            items: { id: string; title: string }[];
          }
        ).items.find((item) => item.title === titleA)?.id;
        expect(itemId, "the item should exist for user A").toBeTruthy();

        // User B never sees user A's item through the real UI.
        await pageB.goto("/todos");
        await expect(pageB.getByText(titleA, { exact: true })).toHaveCount(0);

        // Nor can user B reach it directly by id - ownership-scoped, so a
        // cross-user attempt looks like it does not exist (404), not 403.
        const csrfB = await csrfToken(pageB);
        const crossGet = await pageB.request.get(
          `${apiBaseUrl}/api/v1/todos/${itemId}`,
        );
        expect(crossGet.status()).toBe(404);
        const crossDelete = await pageB.request.delete(
          `${apiBaseUrl}/api/v1/todos/${itemId}`,
          { headers: { "x-csrf-token": csrfB } },
        );
        expect(crossDelete.status()).toBe(404);

        // The 404 above must mean "never touched," not just "reported as
        // not found while quietly deleting it anyway" - confirm the row
        // itself survived the rejected cross-user attempt.
        const survivingRows = await queryInSchema(
          runDatabaseUrl(),
          `SELECT id FROM todos WHERE id = $1`,
          [itemId],
        );
        expect(survivingRows).toHaveLength(1);
      } finally {
        await pageA.close();
        await pageB.close();
      }
    });
  });

  test.describe("denied and recovery journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a revoked session is denied on the to-do list and recovers, reloading real data, on a fresh sign-in", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const suffix = randomUUID().slice(0, 8);
      const email = `todo-denied-${suffix}@e2e.test`;
      const teamMemberRoleId = await roleIdByName(page, "Team Member");
      const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": csrf },
        data: {
          email,
          firstName: "Todo",
          lastName: `Denied ${suffix}`,
          temporaryPassword: TEST_USER_PASSWORD,
          roleId: teamMemberRoleId,
        },
      });
      expect(created.status()).toBe(201);
      const title = `E2E Todo Denied ${suffix}`;

      const disposablePage = await browser.newPage();
      try {
        await signInThroughUi(disposablePage, {
          key: "todo-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Todo",
          lastName: `Denied ${suffix}`,
        });

        await disposablePage.goto("/todos");
        await expect(
          disposablePage.getByRole("heading", { level: 1, name: "To-Do" }),
        ).toBeVisible();
        await disposablePage.getByRole("button", { name: "Add to-do" }).click();
        const createDialog = disposablePage.getByRole("dialog");
        await createDialog.getByLabel("Title").fill(title);
        await createDialog
          .getByLabel("Due date (optional)")
          .fill(todayDateOnly());
        await createDialog
          .getByRole("button", { name: "Create to-do" })
          .click();
        await expect(createDialog).toBeHidden();
        await expect(
          disposablePage.getByText(title, { exact: true }),
        ).toBeVisible();

        const me = await disposablePage.request.get(
          `${apiBaseUrl}/api/v1/auth/me/permissions`,
        );
        expect(me.ok()).toBe(true);
        const userId = ((await me.json()) as { userId: string }).userId;

        await queryInSchema(
          runDatabaseUrl(),
          `UPDATE auth_sessions
              SET revoked_at = now(), revoked_reason = 'ADMIN_REVOKED'
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );

        // The same session that worked a moment ago is refused now that it
        // is authoritatively revoked - re-checked on this reload's own
        // request, not served from anything cached client-side.
        await disposablePage.reload();
        await expect(
          disposablePage.getByText(
            "Your session expired. Sign in again to recover your to-dos.",
          ),
        ).toBeVisible();
        await expect(
          disposablePage.getByRole("link", { name: "Sign in" }),
        ).toBeVisible();

        // Recovery: a fresh sign-in restores real access, and the item
        // created before the revocation reloads from the authoritative API
        // rather than staying stuck denied or coming back empty.
        await signInThroughUi(disposablePage, {
          key: "todo-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Todo",
          lastName: `Denied ${suffix}`,
        });
        await disposablePage.goto("/todos");
        await expect(
          disposablePage.getByRole("heading", { level: 1, name: "To-Do" }),
        ).toBeVisible();
        await expect(
          disposablePage.getByText(title, { exact: true }),
        ).toBeVisible();
      } finally {
        await disposablePage.close();
      }
    });
  });
});
