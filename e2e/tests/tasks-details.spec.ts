import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { departmentIdFor } from "../fixtures/test-data.js";

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "csrf token should be present").toBeTruthy();
  return token as string;
}

test.describe("Task details page — end to end", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("opens a task from the list, stays read-only until Edit, and saves a related event", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = `E2E details ${randomUUID().slice(0, 8)}`;
    const csrf = await csrfToken(page);
    const departmentId = await departmentIdFor(page.request);
    const created = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
      headers: { "x-csrf-token": csrf },
      data: { title, departmentId, description: "Opened from the list." },
    });
    expect(created.status()).toBe(201);
    const task = (await created.json()) as { id: string; identifier: string };
    expect(task.identifier).toMatch(/^TSK-\d{3,}$/);

    // The title in the list is a link to the details page, not a popup.
    await page.goto("/tasks");
    await page.getByRole("link", { name: title, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.getByText(task.identifier, { exact: true }).first(),
    ).toBeVisible();
    await expectNoWcag22AaViolations(page, "task details read-only");

    // Read-only by default: the edit form is absent until Edit is chosen.
    await expect(page.getByRole("form", { name: "Edit task" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("form", { name: "Edit task" });
    await expect(form).toBeVisible();

    // Pick a related event, if the seed provides one, then save.
    const eventTrigger = form.getByRole("combobox", { name: "Related event" });
    await eventTrigger.click();
    const options = page.getByRole("option");
    if ((await options.count()) > 1) {
      await options.nth(1).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("form", { name: "Edit task" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
  });
});
