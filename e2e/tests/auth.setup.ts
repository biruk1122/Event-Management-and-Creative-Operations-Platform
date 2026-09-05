import { expect, test as setup } from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USERS } from "../fixtures/test-users.js";

/**
 * Sign in as every canonical account through the real UI and persist each
 * `storageState`. Reaching the redirect and a 200 from `/auth/me` proves the
 * principal role-based workflow for that account; the saved state lets later
 * authenticated suites skip the sign-in.
 */
for (const user of TEST_USERS) {
  setup(`authenticate ${user.key}`, async ({ page }) => {
    await signInThroughUi(page, user);

    const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      email: user.email.toLowerCase(),
      status: "ACTIVE",
    });

    await page.context().storageState({ path: authStatePath(user.key) });
  });
}
