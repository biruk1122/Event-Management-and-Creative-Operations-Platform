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

test.describe("Event workspace teams and talents — end to end", () => {
  test.describe("administrator journeys", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("Journey A: assigns a team to an event, shows it on the Teams page, then removes only the event link", async ({
      page,
    }) => {
      const suffix = `${fixtureName("wsteam")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const departmentName = `E2E WS Dept ${suffix}`;
      const teamName = `E2E WS Team ${suffix}`;
      const eventName = `E2E WS Event ${suffix}`;

      const department = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers: { "x-csrf-token": csrf }, data: { name: departmentName } },
      );
      expect(department.status()).toBe(201);
      const departmentId = ((await department.json()) as { id: string }).id;

      const team = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: { "x-csrf-token": csrf },
        data: { name: teamName, departmentId },
      });
      expect(team.status()).toBe(201);
      const teamId = ((await team.json()) as { id: string }).id;

      const event = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": csrf },
        data: { name: eventName, eventType: "CONCERT" },
      });
      expect(event.status()).toBe(201);
      const eventId = ((await event.json()) as { id: string }).id;

      await page.goto(`/events/${eventId}/teams`);
      await page.getByRole("button", { name: "Assign team" }).first().click();
      const picker = page.getByRole("dialog");
      await picker.getByRole("option", { name: teamName }).click();
      await picker.getByRole("button", { name: "Assign team" }).click();
      await expect(page.getByRole("heading", { name: teamName })).toBeVisible();

      // The main Teams page lists the event against the team.
      await page.goto("/teams");
      await page.getByText(teamName, { exact: true }).first().click();
      const teamDialog = page.getByRole("dialog");
      await expect(
        teamDialog.getByRole("list", { name: "Assigned events" }),
      ).toContainText(eventName);
      await page.keyboard.press("Escape");

      // Removing the team from the event leaves the team and its record intact.
      await page.goto(`/events/${eventId}/teams`);
      await page
        .getByRole("button", { name: `Remove ${teamName} from this event` })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove from event" })
        .click();
      await expect(page.getByText("No teams yet")).toBeVisible();

      const central = await page.request.get(
        `${apiBaseUrl}/api/v1/teams/${teamId}`,
      );
      expect(central.status()).toBe(200);
    });

    test("Journey B: assigns an existing talent to an event, follows it on the talent profile, then cancels from the event", async ({
      page,
    }) => {
      const suffix = `${fixtureName("wstalent")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const talentName = `E2E WS Talent ${suffix}`;
      const eventName = `E2E WS Talent Event ${suffix}`;

      const talent = await page.request.post(`${apiBaseUrl}/api/v1/talents`, {
        headers: { "x-csrf-token": csrf },
        data: { fullName: talentName, type: "MUSICIAN" },
      });
      expect(talent.status()).toBe(201);
      const talentId = ((await talent.json()) as { id: string }).id;

      const event = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": csrf },
        data: { name: eventName, eventType: "CONCERT" },
      });
      expect(event.status()).toBe(201);
      const eventId = ((await event.json()) as { id: string }).id;

      await page.goto(`/events/${eventId}/talents`);
      await page.getByRole("button", { name: "Assign talent" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("searchbox").fill(talentName);
      await dialog.getByRole("option", { name: talentName }).click();
      await dialog.getByLabel("Role").fill("Headliner");
      await dialog.getByRole("button", { name: "Assign talent" }).click();

      await expect(
        page.getByRole("button", { name: `Edit ${talentName}` }),
      ).toBeVisible();

      // The same assignment appears on the talent's own profile.
      await page.goto(`/talent/${talentId}`);
      await expect(page.getByText(eventName).first()).toBeVisible();

      // Cancelling from the event keeps the record in the talent's history.
      await page.goto(`/events/${eventId}/talents`);
      await page
        .getByRole("button", { name: "Cancel assignment" })
        .first()
        .click();
      const cancel = page.getByRole("dialog");
      await cancel.getByLabel("Reason").fill("Withdrew from the event");
      await cancel.getByRole("button", { name: "Cancel assignment" }).click();
      await expect(page.getByText("Cancelled").first()).toBeVisible();

      await page.goto(`/talent/${talentId}`);
      await expect(page.getByText("Cancelled").first()).toBeVisible();
    });
  });
});
