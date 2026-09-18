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
    (candidate) => candidate.name === "Team Member",
  );
  expect(role, "Team Member role should exist").toBeTruthy();
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
      onlineLink: "https://meet.example.test/e2e",
      participantIds,
    },
  });
  expect(meeting.status()).toBe(201);
  return ((await meeting.json()) as { id: string }).id;
}

test.describe("Meeting participant responses — end to end", () => {
  test.use({ storageState: authStatePath("superAdmin") });

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
        role: "Team Member",
        firstName: "Meeting",
        lastName: suffix,
      });
      await participantPage.goto("/meetings");
      await expect(
        participantPage.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await participantPage.getByRole("button", { name: "Accept" }).click();
      await expect(participantPage.getByRole("status")).toHaveText(
        /marked accepted/i,
      );
      await participantPage.reload();
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
        role: "Team Member",
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
        role: "Team Member",
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
