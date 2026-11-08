import { expect, test } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

/**
 * SMS administration. The harness runs with SMS disabled at the environment
 * level, so nothing in these journeys can send a real message. The journeys
 * never confirm an enable, so the runtime switch is not left on.
 */
test.describe("SMS administration", () => {
  test.describe("Super Admin", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("shows the settings, asks before switching delivery on, and leaves delivery off when cancelled", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "SMS", exact: true }).click();
      await expect(page).toHaveURL("/settings/sms");
      await expect(
        page.getByRole("heading", { level: 1, name: "SMS" }),
      ).toBeVisible();

      // The environment switch is off in the harness, so the page says nothing will be sent.
      await expect(
        page.getByText(/environment switch is off|SMS is off/i).first(),
      ).toBeVisible();
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(/bearer|api key value|callback token value/i);

      await page
        .getByRole("button", { name: "Switch SMS delivery on" })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Turn on SMS delivery?" }),
      ).toBeVisible();
      await expect(dialog).toContainText("real SMS");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Switch SMS delivery on" }),
      ).toBeVisible();

      await expectNoWcag22AaViolations(page, "SMS settings");
    });

    test("finds a recipient by user id without showing a phone number, and reads the history", async ({
      page,
    }) => {
      // Seeded accounts have no display names, so the picker is exercised by user id.
      const access = await page.request.get(
        `${apiBaseUrl}/api/v1/auth/me/permissions`,
      );
      expect(access.ok()).toBe(true);
      const { userId } = (await access.json()) as { userId: string };

      await page.goto("/settings/sms");
      await page.getByRole("tab", { name: "History" }).click();

      await page.getByLabel("Recipient").fill(userId);
      const match = page.getByRole("button", { name: new RegExp(userId) });
      await expect(match).toBeVisible();
      await expect(page.getByText(/\+251/)).toHaveCount(0);

      await match.click();
      await expect(
        page.getByRole("button", { name: "Clear recipient" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("table", { name: "SMS history, newest first" })
          .or(page.getByText("No SMS messages match these filters.")),
      ).toBeVisible();
    });
  });

  test.describe("Admin without SMS administration", () => {
    test.use({ storageState: authStatePath("admin") });

    test("denies the SMS administration page and hides its navigation entry", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "SMS", exact: true }),
      ).toHaveCount(0);

      await page.goto("/settings/sms");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Switch SMS delivery on" }),
      ).toHaveCount(0);
    });
  });
});
