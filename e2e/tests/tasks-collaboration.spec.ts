import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

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

async function userId(page: Page, email: string): Promise<string> {
  const response = await page.request.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    items: { id: string; email: string }[];
  };
  const user = body.items.find((item) => item.email === email);
  expect(user).toBeTruthy();
  return user!.id;
}

test.describe("Task assignment and collaboration — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("assigns, collaborates on, uploads, submits, reviews, persists, and reloads a task", async ({
      page,
      browser,
    }) => {
      const suffix = `${fixtureName("task")}-${randomUUID().slice(0, 8)}`;
      const title = `E2E Task ${suffix}`;
      const comment = "E2E collaboration update";
      const filename = "e2e-task-note.txt";
      const csrf = await csrfToken(page);

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
        .getByRole("option", { name: "Robin Doer", exact: true })
        .click();
      await detail.getByRole("button", { name: "Add", exact: true }).click();
      await expect(
        detail.getByText("Robin Doer", { exact: true }),
      ).toBeVisible();

      const memberContext = await browser.newContext({
        storageState: authStatePath("member"),
      });
      const memberPage = await memberContext.newPage();
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
      const storageUpload = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).port === "9000",
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
      await memberContext.close();
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
    test.use({ storageState: authStatePath("member") });

    test("an unassigned member cannot discover or mutate another task", async ({
      page,
    }) => {
      const owner = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const title = `E2E denied task ${randomUUID().slice(0, 8)}`;
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

        await page.goto("/tasks");
        await expect(
          page.getByRole("heading", { name: "Tasks" }),
        ).toBeVisible();
        await expect(page.getByText(title)).toHaveCount(0);
        const read = await page.request.get(
          `${apiBaseUrl}/api/v1/tasks/${taskId}`,
        );
        expect(read.status()).toBe(403);
        const denied = await page.request.patch(
          `${apiBaseUrl}/api/v1/tasks/${taskId}/progress`,
          {
            headers: { "x-csrf-token": await csrfToken(page) },
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
        await owner.dispose();
      }
    });
  });
});
