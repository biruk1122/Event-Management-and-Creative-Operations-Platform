import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";
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

/** `POST /api/v1/users` grants baseline-only access (no `task.*` permission
 * at all) unless a `roleId` is given explicitly - so a disposable "Team
 * Member" account needs this looked up and passed at creation time. */
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

test.describe("Task assignment and collaboration — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("assigns, collaborates on, uploads, submits, reviews, persists, and reloads a task", async ({
      page,
      browser,
    }) => {
      // A long multi-actor journey (assign, collaborate, a real storage
      // upload plus file scan, submit, review, reload) needs more than
      // the suite's default test timeout.
      test.setTimeout(75_000);
      const suffix = `${fixtureName("task")}-${randomUUID().slice(0, 8)}`;
      const title = `E2E Task ${suffix}`;
      const comment = "E2E collaboration update";
      const filename = "e2e-task-note.txt";
      const csrf = await csrfToken(page);

      // A dedicated, disposable assignee rather than the shared `member`
      // fixture: its storageState is already revoked elsewhere in the suite
      // by auth-session.spec.ts (see that project note), which would make
      // this journey's own assertions fail for a reason unrelated to task
      // collaboration entirely. The identifying suffix comes straight from
      // `randomUUID()`, not `fixtureName`'s own counter: that counter is
      // per-worker-process state, and a retried test can start in a fresh
      // worker where it resets to the same values as the first attempt,
      // colliding with that attempt's still-lingering (never deleted) user.
      const collaboratorSuffix = randomUUID().slice(0, 8);
      const assigneeEmail = `tasks-collaborator-${collaboratorSuffix}@e2e.test`;
      const assigneeName = `Task Collaborator ${collaboratorSuffix}`;
      const teamMemberRoleId = await roleIdByName(page, "Team Member");
      const createAssignee = await page.request.post(
        `${apiBaseUrl}/api/v1/users`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            email: assigneeEmail,
            firstName: "Task",
            lastName: `Collaborator ${collaboratorSuffix}`,
            temporaryPassword: TEST_USER_PASSWORD,
            roleId: teamMemberRoleId,
          },
        },
      );
      expect(createAssignee.status()).toBe(201);

      const workspaceResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/workspaces`,
        {
          headers: { "x-csrf-token": csrf },
          data: { kind: "EVENT" },
        },
      );
      expect(workspaceResponse.status()).toBe(201);
      const workspaceId = ((await workspaceResponse.json()) as { id: string })
        .id;
      const create = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
        headers: { "x-csrf-token": csrf },
        data: {
          title,
          description: "A real end-to-end task.",
          priority: "HIGH",
          workspaceId,
        },
      });
      expect(create.status()).toBe(201);
      const taskId = ((await create.json()) as { id: string }).id;

      await page.goto("/tasks");
      await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
      await expectNoWcag22AaViolations(page, "tasks list");
      await page.getByRole("button", { name: title }).first().click();
      const detail = page.getByRole("dialog");
      await expect(detail.getByRole("heading", { name: title })).toBeVisible();

      await detail.getByRole("combobox", { name: "Add assignee" }).click();
      await page
        .getByRole("option", { name: assigneeName, exact: true })
        .click();
      await detail.getByRole("button", { name: "Add", exact: true }).click();
      await expect(
        detail.getByText(assigneeName, { exact: true }),
      ).toBeVisible();

      const memberPage = await browser.newPage();
      await signInThroughUi(memberPage, {
        key: "tasks-collaborator",
        email: assigneeEmail,
        password: TEST_USER_PASSWORD,
        role: "Team Member",
        firstName: "Task",
        lastName: `Collaborator ${collaboratorSuffix}`,
      });
      await memberPage.goto("/tasks");
      await memberPage.getByRole("button", { name: title }).first().click();
      const memberDetail = memberPage.getByRole("dialog");
      await memberDetail.getByLabel("Update progress").fill("60");
      await memberDetail
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await memberDetail.getByLabel("Add comment").fill(comment);
      await memberDetail.getByRole("button", { name: "Add comment" }).click();
      await expect(
        memberDetail.getByText(comment, { exact: true }),
      ).toBeVisible();

      await memberDetail.locator('input[type="file"]').setInputFiles({
        name: filename,
        mimeType: "text/plain",
        buffer: Buffer.from("task attachment", "utf8"),
      });
      // A real upload to storage plus the (test-mode) file scan step is
      // slower than a typical page action, so give it its own headroom
      // beyond the suite's default action timeout.
      const storageUpload = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).port === "9000",
        { timeout: 45_000 },
      );
      await memberDetail.getByRole("button", { name: "Upload" }).click();
      expect((await storageUpload).ok()).toBe(true);
      await expect(
        memberDetail.getByText(filename, { exact: true }),
      ).toBeVisible();

      await memberDetail
        .getByRole("button", { name: "Move to In progress" })
        .click();
      await expect(
        memberDetail.getByRole("button", { name: "Submit for review" }),
      ).toBeVisible();
      await memberDetail
        .getByRole("button", { name: "Submit for review" })
        .click();
      await memberPage.close();
      await page.reload();
      await page.getByRole("button", { name: title }).first().click();
      const reviewDetail = page.getByRole("dialog");
      await expect(
        reviewDetail.getByRole("button", { name: "Approve" }),
      ).toBeVisible();
      await reviewDetail.getByRole("button", { name: "Approve" }).click();
      await expect(
        reviewDetail.getByText("Completed", { exact: true }),
      ).toBeVisible();

      await page.reload();
      await page.getByRole("button", { name: title }).first().click();
      const reloaded = page.getByRole("dialog");
      await expect(
        reloaded.getByText("Completed", { exact: true }),
      ).toBeVisible();
      await expect(reloaded.getByText(comment, { exact: true })).toBeVisible();
      await expect(reloaded.getByText(filename, { exact: true })).toBeVisible();

      const task = await page.request.get(
        `${apiBaseUrl}/api/v1/tasks/${taskId}`,
      );
      expect(task.ok()).toBe(true);
      expect(
        (await task.json()) as { status: string; progress: number },
      ).toMatchObject({ status: "COMPLETED", progress: 60 });
      const stored = await queryInSchema<{ status: string; progress: number }>(
        runDatabaseUrl(),
        "SELECT status, progress FROM tasks WHERE id = $1",
        [taskId],
      );
      expect(stored).toEqual([{ status: "COMPLETED", progress: 60 }]);
    });
  });

  test.describe("denied journey", () => {
    test("an unassigned member cannot discover or mutate another task", async ({
      browser,
    }) => {
      const owner = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const title = `E2E denied task ${randomUUID().slice(0, 8)}`;
      let disposablePage: Page | undefined;
      try {
        const ownerCsrf = (await owner.storageState()).cookies.find(
          (cookie) => cookie.name === "csrf_token",
        )?.value;
        const workspace = await owner.post(`${apiBaseUrl}/api/v1/workspaces`, {
          headers: { "x-csrf-token": ownerCsrf as string },
          data: { kind: "EVENT" },
        });
        const workspaceId = ((await workspace.json()) as { id: string }).id;
        const created = await owner.post(`${apiBaseUrl}/api/v1/tasks`, {
          headers: { "x-csrf-token": ownerCsrf as string },
          data: { title, workspaceId },
        });
        expect(created.status()).toBe(201);
        const taskId = ((await created.json()) as { id: string }).id;

        // A dedicated, disposable account rather than the shared `member`
        // fixture: its storageState is already revoked elsewhere in the
        // suite by auth-session.spec.ts (see that project note), which would
        // make this denied journey fail for a reason unrelated to
        // authorization entirely. The suffix comes from `randomUUID()`, not
        // `fixtureName`/`fixtureEmail`'s own counter: that counter is
        // per-worker-process state, and a retried test can start in a fresh
        // worker where it resets to the same value as the first attempt,
        // colliding (409) with that attempt's still-lingering user.
        const deniedSuffix = randomUUID().slice(0, 8);
        const email = `tasks-denied-${deniedSuffix}@e2e.test`;
        const teamMemberRoleId = await roleIdByName(
          { request: owner },
          "Team Member",
        );
        const disposableUser = await owner.post(`${apiBaseUrl}/api/v1/users`, {
          headers: { "x-csrf-token": ownerCsrf as string },
          data: {
            email,
            firstName: "Tasks",
            lastName: `Denied ${deniedSuffix}`,
            temporaryPassword: TEST_USER_PASSWORD,
            roleId: teamMemberRoleId,
          },
        });
        expect(disposableUser.status()).toBe(201);

        disposablePage = await browser.newPage();
        await signInThroughUi(disposablePage, {
          key: "tasks-denied",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Tasks",
          lastName: `Denied ${deniedSuffix}`,
        });

        await disposablePage.goto("/tasks");
        await expect(
          disposablePage.getByRole("heading", { name: "Tasks" }),
        ).toBeVisible();
        await expect(disposablePage.getByText(title)).toHaveCount(0);
        const read = await disposablePage.request.get(
          `${apiBaseUrl}/api/v1/tasks/${taskId}`,
        );
        expect(read.status()).toBe(403);
        const denied = await disposablePage.request.patch(
          `${apiBaseUrl}/api/v1/tasks/${taskId}/progress`,
          {
            headers: { "x-csrf-token": await csrfToken(disposablePage) },
            data: { progress: 99 },
          },
        );
        expect(denied.status()).toBe(403);
        const unchanged = await queryInSchema<{ progress: number }>(
          runDatabaseUrl(),
          "SELECT progress FROM tasks WHERE id = $1",
          [taskId],
        );
        expect(unchanged).toEqual([{ progress: 0 }]);
      } finally {
        await disposablePage?.close();
        await owner.dispose();
      }
    });
  });
});
