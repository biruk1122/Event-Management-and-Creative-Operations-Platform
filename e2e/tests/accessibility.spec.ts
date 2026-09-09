import { expect, test } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { testUser } from "../fixtures/test-users.js";

test.describe("accessibility quality gates", () => {
  test("the keyboard sign-in journey meets automated WCAG 2.2 AA checks", async ({
    page,
  }) => {
    const user = testUser("superAdmin");

    await page.goto("/login");
    await expectNoWcag22AaViolations(page, "sign-in screen");

    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByLabel("Password", { exact: true }).press("Enter");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "A dependable surface for the work that comes next.",
      }),
    ).toBeVisible();
    await expectNoWcag22AaViolations(page, "authenticated home screen");
  });
});
