import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

test.use({ storageState: authStatePath("superAdmin") });

test("long assignee menus stay bounded and their last option is selectable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )!.value;
  const headers = { "x-csrf-token": token };
  for (let index = 0; index < 30; index++) {
    const user = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
      headers,
      data: {
        email: `overflow-${suffix}-${index}@e2e.test`,
        firstName: "Overflow",
        lastName: `${suffix} ${index}`,
        temporaryPassword: TEST_USER_PASSWORD,
      },
    });
    expect(user.status()).toBe(201);
  }
  const workspace = await page.request.post(`${apiBaseUrl}/api/v1/workspaces`, {
    headers,
    data: { kind: "EVENT" },
  });
  expect(workspace.status()).toBe(201);
  const { id: workspaceId } = (await workspace.json()) as { id: string };
  const title = `Overflow selection ${suffix}`;
  const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
    headers,
    data: { title, workspaceId },
  });
  expect(task.status()).toBe(201);
  await page.goto("/tasks");
  await page.getByRole("button", { name: title, exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const trigger = dialog.getByRole("combobox", { name: "Add assignee" });
    await trigger.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    const option = menu.getByRole("option").last();
    const label = await option.innerText();
    await option.click();
    await expect(trigger).toContainText(label);
    await expect(menu).toHaveCount(0);
  }
});
