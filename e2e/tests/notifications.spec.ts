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

interface DisposableAssignee {
  email: string;
  name: string;
}

/** Creates a disposable "Team Member" account and a workspace-scoped task,
 * both through the real API - matching tasks-collaboration.spec.ts's own
 * convention - so this spec starts from a clean, unrelated notification
 * recipient rather than the shared `member` fixture (already signed out
 * elsewhere in the suite by auth-session.spec.ts). */
async function createAssignee(
  page: Page,
  csrf: string,
  label: string,
): Promise<DisposableAssignee> {
  const suffix = randomUUID().slice(0, 8);
  const email = `notif-${label}-${suffix}@e2e.test`;
  const name = `Notif ${label} ${suffix}`;
  const teamMemberRoleId = await roleIdByName(page, "Team Member");
  const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": csrf },
    data: {
      email,
      firstName: "Notif",
      lastName: `${label} ${suffix}`,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId: teamMemberRoleId,
    },
  });
  expect(created.status()).toBe(201);
  return { email, name };
}

async function createWorkspace(page: Page, csrf: string): Promise<string> {
  const response = await page.request.post(`${apiBaseUrl}/api/v1/workspaces`, {
    headers: { "x-csrf-token": csrf },
    data: { kind: "EVENT" },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function createTask(
  page: Page,
  csrf: string,
  workspaceId: string,
  title: string,
): Promise<string> {
  const response = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
    headers: { "x-csrf-token": csrf },
    data: {
      title,
      description: "A real end-to-end notification trigger.",
      priority: "MEDIUM",
      workspaceId,
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Assigns `assigneeName` to `title` through the real task dialog - the
 * actual trigger for a TASK_ASSIGNED notification, not a direct API call to
 * whatever internal endpoint the dialog itself happens to use. */
async function assignThroughUi(
  page: Page,
  title: string,
  assigneeName: string,
): Promise<void> {
  await page.goto("/tasks");
  // This helper navigates here twice per test; the suite's default 10s
  // expect timeout is otherwise tight for a second full page render.
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: title }).first().click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("heading", { name: title })).toBeVisible();
  await detail.getByRole("combobox", { name: "Add assignee" }).click();
  await page.getByRole("option", { name: assigneeName, exact: true }).click();
  await detail.getByRole("button", { name: "Add", exact: true }).click();
  await expect(detail.getByText(assigneeName, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  // A second call on the same `page` navigates to "/tasks" again; wait for
  // the dialog to actually finish closing first, or that same-URL
  // navigation can race its close transition.
  await expect(detail).toBeHidden();
}

test.describe("In-app notifications — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("delivers a real-time notification, persists read state and preferences through reload, and updates the bell", async ({
      page,
      browser,
    }) => {
      // Two triggered notifications plus a live-delivery wait need more
      // than the suite's default test timeout.
      test.setTimeout(60_000);
      const csrf = await csrfToken(page);
      const assignee = await createAssignee(page, csrf, "recipient");
      const workspaceId = await createWorkspace(page, csrf);
      const firstTitle = `E2E Notif First ${randomUUID().slice(0, 8)}`;
      const secondTitle = `E2E Notif Second ${randomUUID().slice(0, 8)}`;
      await createTask(page, csrf, workspaceId, firstTitle);
      await createTask(page, csrf, workspaceId, secondTitle);

      await assignThroughUi(page, firstTitle, assignee.name);

      // `browser.newContext()` explicitly, not the `browser.newPage()`
      // shorthand: AxeBuilder below refuses to run against a page whose
      // context was created implicitly (see axe-core-npm's
      // error-handling.md).
      const memberContext = await browser.newContext();
      const memberPage = await memberContext.newPage();
      try {
        await signInThroughUi(memberPage, {
          key: "notif-recipient",
          email: assignee.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Notif",
          lastName: "Recipient",
        });

        await memberPage.goto("/notifications");
        await expect(
          memberPage.getByRole("heading", { level: 1, name: "Notifications" }),
        ).toBeVisible();
        await expectNoWcag22AaViolations(memberPage, "notifications page");

        const feedItem = memberPage
          .getByRole("listitem")
          .filter({ hasText: firstTitle })
          .first();
        await expect(feedItem).toBeVisible();
        await expect(feedItem.getByText("Task assignment")).toBeVisible();
        await expect(
          memberPage.getByText("1 unread notification", { exact: true }),
        ).toBeVisible();

        // A real-time delivery, not a reload: the second assignment happens
        // while this page stays open, and must surface on its own. The
        // outbox relay polls every 2s (notifications-relay.service.ts),
        // so the suite's default 10s expect timeout leaves little margin
        // under load.
        await assignThroughUi(page, secondTitle, assignee.name);
        const secondFeedItem = memberPage
          .getByRole("listitem")
          .filter({ hasText: secondTitle })
          .first();
        await expect(secondFeedItem).toBeVisible({ timeout: 20_000 });
        await expect(
          memberPage.getByText("2 unread notifications", { exact: true }),
        ).toBeVisible();

        await feedItem.getByRole("button", { name: "Mark as read" }).click();
        await expect(feedItem.getByText("Read", { exact: true })).toBeVisible();
        await expect(
          memberPage.getByText("1 unread notification", { exact: true }),
        ).toBeVisible();

        // "New message" (not "Task assignment"): TASK_ASSIGNED is not a
        // mutable notification type (notifications.policy.ts), so this
        // checks preference persistence independently of the assignment
        // notifications above, not a mute of them.
        const newMessageToggle = memberPage.getByRole("checkbox", {
          name: "New message enabled",
        });
        await expect(newMessageToggle).toBeChecked();
        await newMessageToggle.click();
        // A reconciling refetch from the live frame above can land close
        // to this mutation's own settle, so give it the same headroom as
        // the other real-request waits in this test.
        await expect(newMessageToggle).not.toBeChecked({ timeout: 20_000 });

        // Reload proves REST persistence, not client cache: both the read
        // state and the preference must survive a fresh load.
        await memberPage.reload();
        const reloadedFirst = memberPage
          .getByRole("listitem")
          .filter({ hasText: firstTitle })
          .first();
        await expect(
          reloadedFirst.getByText("Read", { exact: true }),
        ).toBeVisible();
        await expect(
          memberPage.getByRole("checkbox", { name: "New message enabled" }),
        ).not.toBeChecked();

        // The nav bell reflects the same authoritative state.
        await memberPage.goto("/");
        const bellButton = memberPage.getByRole("button", {
          name: "Open notifications",
        });
        await expect(bellButton).toBeVisible();
        await bellButton.click();
        const bellDialog = memberPage.getByRole("dialog");
        await expect(
          bellDialog.getByText("1 unread notification.", { exact: true }),
        ).toBeVisible();
        await expect(
          bellDialog.getByRole("listitem").filter({ hasText: secondTitle }),
        ).toBeVisible();
        await expectNoWcag22AaViolations(memberPage, "notifications bell");
      } finally {
        await memberContext.close();
      }
    });
  });

  test.describe("isolation journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a user never sees another user's notifications and cannot mark them read", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const workspaceId = await createWorkspace(page, csrf);
      const assigneeA = await createAssignee(page, csrf, "isolation-a");
      const assigneeB = await createAssignee(page, csrf, "isolation-b");
      const titleA = `E2E Notif Isolation A ${randomUUID().slice(0, 8)}`;
      const titleB = `E2E Notif Isolation B ${randomUUID().slice(0, 8)}`;
      await createTask(page, csrf, workspaceId, titleA);
      await createTask(page, csrf, workspaceId, titleB);
      await assignThroughUi(page, titleA, assigneeA.name);
      await assignThroughUi(page, titleB, assigneeB.name);

      const pageA = await browser.newPage();
      const pageB = await browser.newPage();
      try {
        await signInThroughUi(pageA, {
          key: "notif-isolation-a",
          email: assigneeA.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Notif",
          lastName: "Isolation A",
        });
        await signInThroughUi(pageB, {
          key: "notif-isolation-b",
          email: assigneeB.email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Notif",
          lastName: "Isolation B",
        });

        await pageA.goto("/notifications");
        await expect(
          pageA.getByRole("listitem").filter({ hasText: titleA }),
        ).toBeVisible();
        await expect(
          pageA.getByRole("listitem").filter({ hasText: titleB }),
        ).toHaveCount(0);

        // Wait through the real UI first, same as user A above: the
        // outbox relay's own delivery timing is otherwise unguarded for
        // a raw API call, unlike a `toBeVisible` assertion.
        await pageB.goto("/notifications");
        await expect(
          pageB.getByRole("listitem").filter({ hasText: titleB }),
        ).toBeVisible();

        const listB = await pageB.request.get(
          `${apiBaseUrl}/api/v1/notifications`,
        );
        expect(listB.ok()).toBe(true);
        const notificationBId = (
          (await listB.json()) as { items: { id: string; body: string }[] }
        ).items.find((item) => item.body.includes(titleB))?.id;
        expect(
          notificationBId,
          "user B's own notification should be readable to user B",
        ).toBeTruthy();

        const csrfA = await csrfToken(pageA);
        const crossRead = await pageA.request.put(
          `${apiBaseUrl}/api/v1/notifications/${notificationBId}/read`,
          { headers: { "x-csrf-token": csrfA } },
        );
        expect(crossRead.status()).toBe(404);
      } finally {
        await pageA.close();
        await pageB.close();
      }
    });
  });

  test.describe("denied and recovery journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a revoked session is denied on the notifications page and recovers on a fresh sign-in", async ({
      page,
      browser,
    }) => {
      test.setTimeout(45_000);
      const csrf = await csrfToken(page);
      const suffix = randomUUID().slice(0, 8);
      const email = `notif-denied-${suffix}@e2e.test`;
      const teamMemberRoleId = await roleIdByName(page, "Team Member");
      const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": csrf },
        data: {
          email,
          firstName: "Notif",
          lastName: `Denied ${suffix}`,
          temporaryPassword: TEST_USER_PASSWORD,
          roleId: teamMemberRoleId,
        },
      });
      expect(created.status()).toBe(201);

      const disposablePage = await browser.newPage();
      try {
        await signInThroughUi(disposablePage, {
          key: "notif-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Notif",
          lastName: `Denied ${suffix}`,
        });

        await disposablePage.goto("/notifications");
        await expect(
          disposablePage.getByRole("heading", {
            level: 1,
            name: "Notifications",
          }),
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

        // The same session that worked a moment ago is refused now that
        // it is authoritatively revoked - not cached, re-checked on the
        // next real request this reload makes.
        await disposablePage.reload();
        await expect(
          disposablePage.getByText(
            "Your session expired. Sign in again to recover notifications.",
          ),
        ).toBeVisible();
        await expect(
          disposablePage.getByRole("link", { name: "Sign in" }),
        ).toBeVisible();

        // Recovery: a fresh sign-in restores real access, not a stuck
        // denied state. (The link's own destination is already covered by
        // the visibility check above; signInThroughUi drives the actual
        // navigation.)
        await signInThroughUi(disposablePage, {
          key: "notif-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Notif",
          lastName: `Denied ${suffix}`,
        });
        await disposablePage.goto("/notifications");
        await expect(
          disposablePage.getByRole("heading", {
            level: 1,
            name: "Notifications",
          }),
        ).toBeVisible();
      } finally {
        await disposablePage.close();
      }
    });
  });
});
