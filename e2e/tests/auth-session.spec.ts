import { expect, test } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { testUser } from "../fixtures/test-users.js";

test.use({ storageState: authStatePath("member") });

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

test.describe("authenticated session lifecycle", () => {
  test("the session persists across a reload and is revoked on sign-out", async ({
    page,
  }) => {
    // Authoritative account data is readable with the restored session.
    const before = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(before.status()).toBe(200);
    expect(await before.json()).toMatchObject({
      email: member.email.toLowerCase(),
      status: "ACTIVE",
    });

    // A live refresh session is persisted for the account.
    const live = await queryInSchema<{ id: string }>(
      runDatabaseUrl(),
      `SELECT s.id
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE u.email = $1 AND s.revoked_at IS NULL`,
      [member.email.toLowerCase()],
    );
    expect(live.length).toBeGreaterThanOrEqual(1);

    // Reloading the application keeps the user signed in.
    await page.goto("/");
    await page.reload();
    const afterReload = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(afterReload.status()).toBe(200);

    // Sign out through the real endpoint with the CSRF double-submit header.
    const cookies = await page.context().cookies();
    const csrfToken = cookies.find(
      (cookie) => cookie.name === "csrf_token",
    )?.value;
    expect(csrfToken, "csrf_token cookie should be present").toBeTruthy();

    const logout = await page.request.post(`${apiBaseUrl}/api/v1/auth/logout`, {
      headers: { "x-csrf-token": csrfToken as string },
    });
    expect(logout.ok()).toBe(true);

    // The session no longer authenticates and is recorded as revoked.
    const afterLogout = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(afterLogout.status()).toBe(401);

    const revoked = await queryInSchema<{ revoked_reason: string | null }>(
      runDatabaseUrl(),
      `SELECT s.revoked_reason
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE u.email = $1
        ORDER BY s.issued_at DESC
        LIMIT 1`,
      [member.email.toLowerCase()],
    );
    expect(revoked[0]?.revoked_reason).toBe("LOGOUT");
  });
});
