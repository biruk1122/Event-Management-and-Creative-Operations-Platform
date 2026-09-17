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
 * clean, unrelated calendar owner rather than the shared `member` fixture
 * (already signed out elsewhere in the suite by auth-session.spec.ts),
 * matching notifications.spec.ts's own convention. */
async function createDisposableUser(
  page: Page,
  csrf: string,
  label: string,
): Promise<DisposableUser> {
  const suffix = randomUUID().slice(0, 8);
  const email = `cal-${label}-${suffix}@e2e.test`;
  const teamMemberRoleId = await roleIdByName(page, "Team Member");
  const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": csrf },
    data: {
      email,
      firstName: "Cal",
      lastName: `${label} ${suffix}`,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId: teamMemberRoleId,
    },
  });
  expect(created.status()).toBe(201);
  return { email };
}

/** A `datetime-local` value for "today" (the calendar's default view), so
 * the created entry is always visible without navigating months regardless
 * of which day of the month the suite happens to run on. */
function todayAt(hour: number, minute = 0): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(hour)}:${pad(minute)}`;
}

/** A generous `from`/`to` window (yesterday through tomorrow) for a direct
 * `GET /api/v1/calendar` call, wide enough to tolerate timezone rounding
 * around midnight without risking the server's 90-day maximum. */
function todayRangeQuery(): string {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

test.describe("Calendar and personal schedules — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates, persists across reload, edits, and deletes a personal calendar entry through the real API", async ({
      page,
    }) => {
      // Create, two reloads, an edit, and a delete, each a real round trip.
      test.setTimeout(45_000);
      const title = `E2E Calendar Entry ${randomUUID().slice(0, 8)}`;
      const updatedTitle = `${title} (updated)`;

      await page.goto("/calendar");
      await expect(
        page.getByRole("heading", { level: 1, name: "Calendar" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "calendar page, empty");

      await page.getByRole("button", { name: "Add entry" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New entry" }),
      ).toBeVisible();
      await createDialog.getByLabel("Title").fill(title);
      await createDialog
        .getByLabel("Description")
        .fill("Created by the calendar end-to-end suite.");
      await createDialog.getByLabel("Start").fill(todayAt(10, 0));
      await createDialog.getByRole("button", { name: "Create entry" }).click();
      await expect(createDialog).toBeHidden();

      const entryChip = page.getByText(title, { exact: true });
      await expect(entryChip).toBeVisible();
      await expectNoWcag22AaViolations(page, "calendar page, with an entry");

      // Reload proves REST persistence, not client cache.
      await page.reload();
      await expect(page.getByText(title, { exact: true })).toBeVisible();

      // Edit: the Type control must be disabled - the real update contract
      // has no such field, so the UI must not offer to change it.
      await page.getByText(title, { exact: true }).click();
      const editDialog = page.getByRole("dialog");
      await expect(
        editDialog.getByRole("heading", { name: "Edit entry" }),
      ).toBeVisible();
      await expect(editDialog.getByLabel("Type")).toBeDisabled();
      await editDialog.getByLabel("Title").fill(updatedTitle);
      await editDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(editDialog).toBeHidden();
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

      // Reload again: the edit is authoritative, not just an optimistic
      // local update.
      await page.reload();
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(title, { exact: true })).not.toBeVisible();

      // Delete, then confirm through both the UI and the database directly -
      // not just that the chip disappeared from a component that could,
      // hypothetically, hide it without actually deleting anything.
      await page.getByText(updatedTitle, { exact: true }).click();
      const deleteDialog = page.getByRole("dialog");
      await deleteDialog.getByRole("button", { name: "Delete" }).click();
      await expect(deleteDialog).toBeHidden();
      await expect(
        page.getByText(updatedTitle, { exact: true }),
      ).not.toBeVisible();

      const rows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM calendar_entries WHERE title = $1`,
        [updatedTitle],
      );
      expect(rows).toHaveLength(0);
    });
  });

  test.describe("isolation journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a user's personal calendar entries are never visible to, or reachable by, another user", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const userA = await createDisposableUser(page, csrf, "isolation-a");
      const userB = await createDisposableUser(page, csrf, "isolation-b");
      const titleA = `E2E Calendar Isolation A ${randomUUID().slice(0, 8)}`;

      const pageA = await browser.newPage();
      const pageB = await browser.newPage();
      try {
        await signInThroughUi(pageA, {
          key: "cal-isolation-a",
          email: userA.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Cal",
          lastName: "Isolation A",
        });
        await signInThroughUi(pageB, {
          key: "cal-isolation-b",
          email: userB.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Cal",
          lastName: "Isolation B",
        });

        await pageA.goto("/calendar");
        await pageA.getByRole("button", { name: "Add entry" }).click();
        const dialogA = pageA.getByRole("dialog");
        await dialogA.getByLabel("Title").fill(titleA);
        await dialogA.getByLabel("Start").fill(todayAt(11, 0));
        await dialogA.getByRole("button", { name: "Create entry" }).click();
        await expect(dialogA).toBeHidden();
        const entryIdResponse = await pageA.request.get(
          `${apiBaseUrl}/api/v1/calendar?${todayRangeQuery()}`,
        );
        expect(entryIdResponse.ok()).toBe(true);
        const entryId = (
          (await entryIdResponse.json()) as {
            items: { id: string; title: string }[];
          }
        ).items.find((item) => item.title === titleA)?.id;
        expect(entryId, "the entry should exist for user A").toBeTruthy();

        // User B never sees user A's entry through the real UI.
        await pageB.goto("/calendar");
        await expect(pageB.getByText(titleA, { exact: true })).toHaveCount(0);

        // Nor can user B reach it directly by id - ownership-scoped, so a
        // cross-user attempt looks like it does not exist (404), not 403.
        const csrfB = await csrfToken(pageB);
        const crossGet = await pageB.request.get(
          `${apiBaseUrl}/api/v1/calendar/${entryId}`,
        );
        expect(crossGet.status()).toBe(404);
        const crossDelete = await pageB.request.delete(
          `${apiBaseUrl}/api/v1/calendar/${entryId}`,
          { headers: { "x-csrf-token": csrfB } },
        );
        expect(crossDelete.status()).toBe(404);
      } finally {
        await pageA.close();
        await pageB.close();
      }
    });
  });

  test.describe("denied and recovery journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a revoked session is denied on the calendar and recovers, reloading real data, on a fresh sign-in", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const suffix = randomUUID().slice(0, 8);
      const email = `cal-denied-${suffix}@e2e.test`;
      const teamMemberRoleId = await roleIdByName(page, "Team Member");
      const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": csrf },
        data: {
          email,
          firstName: "Cal",
          lastName: `Denied ${suffix}`,
          temporaryPassword: TEST_USER_PASSWORD,
          roleId: teamMemberRoleId,
        },
      });
      expect(created.status()).toBe(201);
      const title = `E2E Calendar Denied ${suffix}`;

      const disposablePage = await browser.newPage();
      try {
        await signInThroughUi(disposablePage, {
          key: "cal-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Cal",
          lastName: `Denied ${suffix}`,
        });

        await disposablePage.goto("/calendar");
        await expect(
          disposablePage.getByRole("heading", { level: 1, name: "Calendar" }),
        ).toBeVisible();
        await disposablePage.getByRole("button", { name: "Add entry" }).click();
        const createDialog = disposablePage.getByRole("dialog");
        await createDialog.getByLabel("Title").fill(title);
        await createDialog.getByLabel("Start").fill(todayAt(9, 0));
        await createDialog
          .getByRole("button", { name: "Create entry" })
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
            "Your session expired. Sign in again to recover your calendar.",
          ),
        ).toBeVisible();
        await expect(
          disposablePage.getByRole("link", { name: "Sign in" }),
        ).toBeVisible();

        // Recovery: a fresh sign-in restores real access, and the entry
        // created before the revocation reloads from the authoritative API
        // rather than staying stuck denied or coming back empty.
        await signInThroughUi(disposablePage, {
          key: "cal-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Cal",
          lastName: `Denied ${suffix}`,
        });
        await disposablePage.goto("/calendar");
        await expect(
          disposablePage.getByRole("heading", { level: 1, name: "Calendar" }),
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
