import { expect, test } from "@playwright/test";

import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { testUser } from "../fixtures/test-users.js";

// This journey starts from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

const member = testUser("member");

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

test.describe("rejected sign-in", () => {
  test("a wrong password is refused, issues no session, and is recorded", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(member.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The form shows the mapped credential error and stays put.
    await expect(
      page.getByText("Your email or password is incorrect"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // No session cookie was issued.
    const cookies = await page.context().cookies();
    expect(
      cookies.find((cookie) => cookie.name === "access_token"),
    ).toBeUndefined();

    // The API agrees there is no session.
    const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(me.status()).toBe(401);

    // The failed attempt is persisted against the credential.
    const rows = await queryInSchema<{ failed_attempt_count: number }>(
      runDatabaseUrl(),
      `SELECT c.failed_attempt_count
         FROM user_credentials c
         JOIN users u ON u.id = c.user_id
        WHERE u.email = $1`,
      [member.email.toLowerCase()],
    );
    expect(rows[0]?.failed_attempt_count ?? 0).toBeGreaterThanOrEqual(1);
  });
});
