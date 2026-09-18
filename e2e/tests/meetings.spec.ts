import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

async function csrfToken(page: Parameters<typeof signInThroughUi>[0]) {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token).toBeTruthy();
  return token!;
}

test.describe("Meeting participant responses — end to end", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("an invited participant accepts a real meeting and reloads authoritative data", async ({
    page,
    browser,
  }) => {
    test.setTimeout(45_000);
    const suffix = randomUUID().slice(0, 8);
    const csrf = await csrfToken(page);
    const roles = await page.request.get(`${apiBaseUrl}/api/v1/roles`);
    const teamMemberRole = (
      (await roles.json()) as { id: string; name: string }[]
    ).find((role) => role.name === "Team Member");
    expect(teamMemberRole).toBeTruthy();
    const email = `meeting-${suffix}@e2e.test`;
    const user = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
      headers: { "x-csrf-token": csrf },
      data: {
        email,
        firstName: "Meeting",
        lastName: suffix,
        temporaryPassword: TEST_USER_PASSWORD,
        roleId: teamMemberRole!.id,
      },
    });
    expect(user.status()).toBe(201);
    const userId = ((await user.json()) as { id: string }).id;
    const title = `E2E Meeting ${suffix}`;
    const startAt = new Date(Date.now() + 86_400_000).toISOString();
    const endAt = new Date(Date.now() + 90_000_000).toISOString();
    const meeting = await page.request.post(`${apiBaseUrl}/api/v1/meetings`, {
      headers: { "x-csrf-token": csrf },
      data: {
        title,
        type: "HYBRID",
        startAt,
        endAt,
        location: "Studio A",
        onlineLink: "https://meet.example.test/e2e",
        participantIds: [userId],
      },
    });
    expect(meeting.status()).toBe(201);

    const participantPage = await browser.newPage();
    try {
      await signInThroughUi(participantPage, {
        key: `meeting-${suffix}`,
        email,
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
});
