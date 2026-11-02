import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { departmentIdFor } from "../fixtures/test-data.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "csrf token should be present").toBeTruthy();
  return token as string;
}

test.describe("Admin coordination - end to end", () => {
  test.describe("administrator coordination journey", () => {
    test.use({ storageState: authStatePath("admin") });

    test("assigns a department member directly, receives and approves their work, and sees no user administration", async ({
      page,
      browser,
    }) => {
      test.setTimeout(75_000);
      // A disposable member: the shared `member` account's session is revoked
      // by the auth-session spec, which would fail this journey for an
      // unrelated reason (see tasks-collaboration.spec.ts).
      const owner = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const suffix = randomUUID().slice(0, 8);
      const memberEmail = `admin-flow-member-${suffix}@e2e.test`;
      const memberName = `Flow Member ${suffix}`;
      try {
        const ownerPage = await owner.get(`${apiBaseUrl}/api/v1/auth/me`);
        expect(ownerPage.ok()).toBe(true);
        const csrf = (await owner.storageState()).cookies.find(
          (cookie) => cookie.name === "csrf_token",
        )?.value;
        const roles = (await (
          await owner.get(`${apiBaseUrl}/api/v1/roles`)
        ).json()) as { id: string; name: string }[];
        const memberRole = roles.find((r) => r.name === "Department Member");
        const departmentId = await departmentIdFor(owner);
        const created = await owner.post(`${apiBaseUrl}/api/v1/users`, {
          headers: { "x-csrf-token": csrf ?? "" },
          data: {
            email: memberEmail,
            firstName: "Flow",
            lastName: `Member ${suffix}`,
            temporaryPassword: TEST_USER_PASSWORD,
            roleId: memberRole?.id,
            departmentId,
          },
        });
        expect(created.status()).toBe(201);
        const memberId = ((await created.json()) as { id: string }).id;

        // The Admin assigns a task in Production directly to that member.
        const adminCsrf = await csrfToken(page);
        const title = `E2E Admin task ${suffix}`;
        const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
          headers: { "x-csrf-token": adminCsrf },
          data: {
            title,
            description: "Assigned directly by Admin.",
            priority: "HIGH",
            departmentId,
            assigneeId: memberId,
          },
        });
        expect(task.status()).toBe(201);
        const taskBody = (await task.json()) as {
          id: string;
          reportTo: { id: string } | null;
        };
        // The person who assigns it is the default reporting recipient.
        expect(taskBody.reportTo).not.toBeNull();

        // The Admin sees it - across departments - with "Reports to" naming them.
        await page.goto("/tasks");
        await page.getByRole("button", { name: title }).first().click();
        const detail = page.getByRole("dialog");
        await expect(
          detail.getByRole("heading", { name: title }),
        ).toBeVisible();
        await expect(detail.getByText("Reports to")).toBeVisible();
        await expect(detail.getByText(/\(you\)/)).toBeVisible();
        await page.keyboard.press("Escape");

        // The member does the work and submits it for review.
        const memberContext = await browser.newContext();
        const memberPage = await memberContext.newPage();
        await signInThroughUi(memberPage, {
          key: "admin-flow-member",
          email: memberEmail,
          password: TEST_USER_PASSWORD,
          role: "Department Member",
          firstName: "Flow",
          lastName: `Member ${suffix}`,
        });
        const memberCsrf = await csrfToken(memberPage);
        const started = await memberPage.request.post(
          `${apiBaseUrl}/api/v1/tasks/${taskBody.id}/transition`,
          {
            headers: { "x-csrf-token": memberCsrf },
            data: { status: "IN_PROGRESS" },
          },
        );
        expect(started.ok()).toBe(true);
        const submitted = await memberPage.request.post(
          `${apiBaseUrl}/api/v1/tasks/${taskBody.id}/submit`,
          { headers: { "x-csrf-token": memberCsrf }, data: {} },
        );
        expect(submitted.ok()).toBe(true);
        await memberContext.close();

        // The Admin (the recipient) reviews and approves it.
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
        expect(memberName).toContain(suffix);

        // Admin is a coordinator, not a user administrator.
        await page.keyboard.press("Escape");
        await page.goto("/dashboard");
        await expect(
          page.getByRole("link", { name: "Users", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Roles and permissions" }),
        ).toHaveCount(0);
        const users = await page.request.get(`${apiBaseUrl}/api/v1/users`);
        expect(users.status()).toBe(403);
        const roleList = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
        expect(roleList.status()).toBe(403);
      } finally {
        await owner.dispose();
      }
    });
  });

  test.describe("denied journey", () => {
    test.use({ storageState: authStatePath("admin") });

    test("Admin cannot grant roles, change their own role, or name a task recipient", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);
      const me = (await (
        await page.request.get(`${apiBaseUrl}/api/v1/auth/me`)
      ).json()) as { id: string };
      const roleChange = await page.request.put(
        `${apiBaseUrl}/api/v1/users/${me.id}/role`,
        { headers: { "x-csrf-token": csrf }, data: { roleId: me.id } },
      );
      expect(roleChange.status()).toBe(403);

      const departmentId = await departmentIdFor(page.request);
      const named = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
        headers: { "x-csrf-token": csrf },
        data: {
          title: `E2E recipient ${randomUUID().slice(0, 8)}`,
          departmentId,
          reportToId: me.id,
        },
      });
      // Only Super Admin may name a recipient other than themselves.
      expect(named.status()).toBe(403);
    });
  });
});
