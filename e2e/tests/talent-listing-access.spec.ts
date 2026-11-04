import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";

const viewports = [
  { width: 360, height: 800 },
  { width: 1440, height: 900 },
];

async function noHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe("Talent listing for an organization-wide reader", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  for (const viewport of viewports) {
    test(`lists talent with summary tiles and an accessible Add Talent dialog at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/talent");

      await expect(
        page.getByText("Talent profiles", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Available now", { exact: true }),
      ).toBeVisible();
      await noHorizontalScroll(page);
      await expectNoWcag22AaViolations(
        page,
        `talent listing ${viewport.width}`,
      );
      await attachScreenshot(
        page,
        testInfo,
        `talent-listing-${viewport.width}`,
      );

      const newTalent = page.getByRole("button", {
        name: "New talent",
        exact: true,
      });
      await newTalent.click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "New talent", exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByLabel("Full name", { exact: true }),
      ).toBeFocused();
      await expectNoWcag22AaViolations(
        page,
        `add talent dialog ${viewport.width}`,
      );
      await attachScreenshot(page, testInfo, `add-talent-${viewport.width}`);

      // Escape closes the dialog and returns focus to the button that opened it.
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(newTalent).toBeFocused();
    });
  }
});

test.describe("Talent listing for a Production Manager", () => {
  test.use({ storageState: authStatePath("productionManager") });

  test("reads the directory without create actions, and cannot open the create dialog", async ({
    page,
  }) => {
    await page.goto("/talent");
    await expect(
      page.getByText("Talent profiles", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New talent", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Contact details are masked", { exact: false }),
    ).toBeVisible();
  });
});

test.describe("Talent listing for a member without talent access", () => {
  test.use({ storageState: authStatePath("member") });

  test("is refused the talent area", async ({ page }) => {
    await page.goto("/talent");
    await expect(page.getByRole("alert")).toContainText(
      "You do not have access to this area.",
    );
  });
});
