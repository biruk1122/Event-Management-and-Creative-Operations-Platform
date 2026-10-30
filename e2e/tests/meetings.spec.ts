import { departmentIdFor } from "../fixtures/test-data.js";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

async function csrfToken(page: Page) {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token).toBeTruthy();
  return token!;
}

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("global setup should export DATABASE_URL");
  return url;
}

async function teamMemberRoleId(page: Page): Promise<string> {
  const roles = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
  expect(roles.ok()).toBe(true);
  const role = ((await roles.json()) as { id: string; name: string }[]).find(
    (candidate) => candidate.name === "Department Member",
  );
  expect(role, "Department Member role should exist").toBeTruthy();
  return role!.id;
}

async function createTeamMember(page: Page, suffix: string) {
  const email = `meeting-${suffix}@e2e.test`;
  const user = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": await csrfToken(page) },
    data: {
      email,
      firstName: "Meeting",
      lastName: suffix,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId: await teamMemberRoleId(page),
      departmentId: await departmentIdFor(page.request),
    },
  });
  expect(user.status()).toBe(201);
  return { email, id: ((await user.json()) as { id: string }).id };
}

async function createMeeting(
  page: Page,
  title: string,
  participantIds: string[],
): Promise<string> {
  const startAt = new Date(Date.now() + 86_400_000).toISOString();
  const endAt = new Date(Date.now() + 90_000_000).toISOString();
  const meeting = await page.request.post(`${apiBaseUrl}/api/v1/meetings`, {
    headers: { "x-csrf-token": await csrfToken(page) },
    data: {
      title,
      type: "HYBRID",
      startAt,
      endAt,
      location: "Studio A",
      participantIds,
    },
  });
  expect(meeting.status()).toBe(201);
  return ((await meeting.json()) as { id: string }).id;
}

test.describe("Meeting participant responses — end to end", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("an organizer edits a completed meeting and removes it only after confirmation", async ({
    page,
  }) => {
    const title = `Editable completed meeting ${randomUUID().slice(0, 8)}`;
    const id = await createMeeting(page, title, []);
    const headers = { "x-csrf-token": await csrfToken(page) };
    expect(
      (
        await page.request.post(
          `${apiBaseUrl}/api/v1/meetings/${id}/transition`,
          { headers, data: { status: "COMPLETED" } },
        )
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/meetings?meetingId=${id}`);
    await page
      .getByRole("button", { name: "Edit meeting", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Meeting title", { exact: true })
      .fill(`${title} revised`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${title} revised`, exact: true }),
    ).toBeVisible();
    // The status shows on both the list card and the detail badge.
    await expect(
      page.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();
    // Authorization must hold independently of the visible confirmation dialog.
    expect(
      (
        await page.request.delete(`${apiBaseUrl}/api/v1/meetings/${id}`)
      ).status(),
    ).toBe(403);
    await page
      .getByRole("button", { name: "Remove meeting", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Keep meeting" }),
    ).toBeFocused();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Keep meeting" }).click();
    expect(
      (await page.request.get(`${apiBaseUrl}/api/v1/meetings/${id}`)).ok(),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Remove meeting", exact: true })
      .click();
    const deleted = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/meetings/${id}`) &&
        response.request().method() === "DELETE",
    );
    await dialog.getByRole("button", { name: "Yes, remove meeting" }).click();
    expect((await deleted).status()).toBe(204);
    await expect(
      page.getByRole("heading", { name: `${title} revised`, exact: true }),
    ).toBeHidden();
    expect(
      (await page.request.get(`${apiBaseUrl}/api/v1/meetings/${id}`)).status(),
    ).toBe(404);
  });

  test("an invited participant accepts a real meeting and reloads authoritative data", async ({
    page,
    browser,
  }) => {
    test.setTimeout(45_000);
    const suffix = randomUUID().slice(0, 8);
    const participant = await createTeamMember(page, suffix);
    const title = `E2E Meeting ${suffix}`;
    await createMeeting(page, title, [participant.id]);

    const participantPage = await browser.newPage();
    try {
      await signInThroughUi(participantPage, {
        key: `meeting-${suffix}`,
        email: participant.email,
        password: TEST_USER_PASSWORD,
        role: "Department Member",
        firstName: "Meeting",
        lastName: suffix,
      });
      await participantPage.goto("/meetings");
      await expect(
        participantPage.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await participantPage.getByRole("button", { name: "Accept" }).click();
      await expect(
        participantPage.getByRole("main").getByRole("status"),
      ).toHaveText(/marked accepted/i);
      await participantPage.reload();
      await participantPage
        .getByRole("button", { name: "View participants" })
        .click();
      await expect(
        participantPage.getByText("Accepted", { exact: true }),
      ).toBeVisible();
    } finally {
      await participantPage.close();
    }
  });

  test("keeps an uninvited user from viewing or responding to another user's meeting", async ({
    page,
    browser,
  }) => {
    test.setTimeout(45_000);
    const suffix = randomUUID().slice(0, 8);
    const invited = await createTeamMember(page, `invited-${suffix}`);
    const title = `E2E Isolated Meeting ${suffix}`;
    const meetingId = await createMeeting(page, title, [invited.id]);

    const outsiderContext = await browser.newContext({
      storageState: authStatePath("deptManager"),
    });
    const outsiderPage = await outsiderContext.newPage();
    try {
      // A Department Manager has meeting-read at department scope, but this
      // independent, unassigned invitation must not become visible through
      // that broader permission.
      await outsiderPage.goto("/meetings");
      await expect(
        outsiderPage.getByRole("heading", { name: "No meetings to show" }),
      ).toBeVisible();
      await expect(outsiderPage.getByText(title, { exact: true })).toHaveCount(
        0,
      );

      const hidden = await outsiderPage.request.get(
        `${apiBaseUrl}/api/v1/meetings/${meetingId}`,
      );
      expect(hidden.status()).toBe(403);
      const crossResponse = await outsiderPage.request.put(
        `${apiBaseUrl}/api/v1/meetings/${meetingId}/response`,
        {
          headers: { "x-csrf-token": await csrfToken(outsiderPage) },
          data: { response: "DECLINED" },
        },
      );
      expect(crossResponse.status()).toBe(403);

      // A rejected cross-user response never mutates the participant's
      // authoritative response state.
      const organizerRead = await page.request.get(
        `${apiBaseUrl}/api/v1/meetings/${meetingId}`,
      );
      const meeting = (await organizerRead.json()) as {
        participants: { id: string; response: string }[];
      };
      expect(meeting.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: invited.id, response: "PENDING" }),
        ]),
      );
    } finally {
      await outsiderContext.close();
    }
  });

  test("denies a revoked participant session and recovers authoritative meeting access after sign-in", async ({
    page,
    browser,
  }) => {
    test.setTimeout(45_000);
    const suffix = randomUUID().slice(0, 8);
    const participant = await createTeamMember(page, `recovery-${suffix}`);
    const title = `E2E Recovery Meeting ${suffix}`;
    await createMeeting(page, title, [participant.id]);

    const participantPage = await browser.newPage();
    try {
      await signInThroughUi(participantPage, {
        key: `meeting-recovery-${suffix}`,
        email: participant.email,
        password: TEST_USER_PASSWORD,
        role: "Department Member",
        firstName: "Meeting",
        lastName: `recovery-${suffix}`,
      });
      await participantPage.goto("/meetings");
      await expect(
        participantPage.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();

      const permissions = await participantPage.request.get(
        `${apiBaseUrl}/api/v1/auth/me/permissions`,
      );
      expect(permissions.ok()).toBe(true);
      const userId = ((await permissions.json()) as { userId: string }).userId;
      await queryInSchema(
        runDatabaseUrl(),
        `UPDATE auth_sessions
            SET revoked_at = now(), revoked_reason = 'ADMIN_REVOKED'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );

      await participantPage.reload();
      await expect(
        participantPage.getByText(
          "Your session expired. Sign in again to recover your meetings.",
        ),
      ).toBeVisible();

      await signInThroughUi(participantPage, {
        key: `meeting-recovery-${suffix}`,
        email: participant.email,
        password: TEST_USER_PASSWORD,
        role: "Department Member",
        firstName: "Meeting",
        lastName: `recovery-${suffix}`,
      });
      await participantPage.goto("/meetings");
      await expect(
        participantPage.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    } finally {
      await participantPage.close();
    }
  });
});
