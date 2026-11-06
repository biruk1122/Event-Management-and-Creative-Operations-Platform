import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

test.describe("Event workspace tasks, calendar and meetings — end to end", () => {
  test.describe("administrator journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("shows the event's linked task, its milestone on the calendar, and the meetings empty state", async ({
      page,
    }) => {
      const suffix = `${fixtureName("wsp3")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const eventName = `E2E P3 Event ${suffix}`;
      const taskTitle = `E2E P3 Task ${suffix}`;
      const milestoneName = `E2E P3 Milestone ${suffix}`;

      const event = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": csrf },
        data: { name: eventName, eventType: "CONCERT" },
      });
      expect(event.status()).toBe(201);
      const created = (await event.json()) as {
        id: string;
        workspaceId: string;
      };
      const eventId = created.id;

      const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
        headers: { "x-csrf-token": csrf },
        data: {
          title: taskTitle,
          // A task needs an owner: the event's own workspace.
          workspaceId: created.workspaceId,
          relatedEventId: eventId,
          dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        },
      });
      expect(task.status()).toBe(201);

      const milestone = await page.request.post(
        `${apiBaseUrl}/api/v1/events/${eventId}/milestones`,
        {
          headers: { "x-csrf-token": csrf },
          data: { name: milestoneName, dueDate: "2030-06-01" },
        },
      );
      expect(milestone.status()).toBe(201);

      await page.goto(`/events/${eventId}/tasks`);
      await expect(page.getByRole("link", { name: taskTitle })).toBeVisible();

      await page.goto(`/events/${eventId}/calendar`);
      await expect(page.getByText(milestoneName)).toBeVisible();
      await expect(page.getByText(taskTitle)).toBeVisible();

      await page.goto(`/events/${eventId}/meetings`);
      await expect(page.getByText("No meetings yet")).toBeVisible();
    });
  });
});
