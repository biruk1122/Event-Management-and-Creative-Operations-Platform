import { randomUUID } from "node:crypto";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

/** The list caption renders `N event` / `N events`. */
function eventCount(total: number): string {
  return `${total} event${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

interface ApiEvent {
  id: string;
  workspaceId: string;
  name: string;
  eventType: string;
  status: string;
  manager: { id: string; email: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string; email: string }[];
}

async function userIdByEmail(
  requester: Pick<Page, "request">,
  email: string,
): Promise<string> {
  const response = await requester.request.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  const user = (
    (await response.json()) as { items: { id: string; email: string }[] }
  ).items.find((candidate) => candidate.email === email);
  expect(user, `seeded user ${email} should be readable`).toBeTruthy();
  return user!.id;
}

test.describe("Event management — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates an event, assigns its manager and team, sets a budget, moves through its lifecycle, persists through reload, then unassigns and deletes", async ({
      page,
    }) => {
      // A random tail on top of the run-scoped name so a Playwright retry,
      // which restarts the fixture sequence in a fresh worker, cannot collide
      // with the failed attempt's still-present department.
      const suffix = `${fixtureName("event")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const departmentName = `E2E EVT Dept ${suffix}`;
      const teamName = `E2E EVT Team ${suffix}`;
      const eventName = `E2E Launch ${suffix}`;
      const managerEmail = "member@e2e.test";

      // A team is department-owned, so create the owning department and team
      // through the API before driving the event UI.
      const departmentResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        { headers: { "x-csrf-token": csrf }, data: { name: departmentName } },
      );
      expect(departmentResponse.status()).toBe(201);
      const teamResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/teams`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            name: teamName,
            departmentId: ((await departmentResponse.json()) as { id: string })
              .id,
          },
        },
      );
      expect(teamResponse.status()).toBe(201);
      const teamId = ((await teamResponse.json()) as { id: string }).id;
      const managerId = await userIdByEmail(page, managerEmail);

      // The account holds event.read at organization scope, so the nav entry
      // shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Events" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/events");
      await expect(
        page.getByRole("heading", { level: 1, name: "Events" }),
      ).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/events`);
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(eventCount(baseline), { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "events list");

      // Create an event through the dialog.
      await page.getByRole("button", { name: "New event" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New event" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create event dialog");

      await createDialog.getByRole("textbox", { name: "Name" }).fill(eventName);
      await createDialog.getByRole("combobox", { name: "Type" }).click();
      await page
        .getByRole("option", { name: "Corporate event", exact: true })
        .click();
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page
        .getByRole("option", { name: managerEmail, exact: true })
        .click();
      await createDialog.getByRole("button", { name: "Create event" }).click();

      await expect(
        page.getByText(eventCount(baseline + 1), { exact: true }),
      ).toBeVisible();

      // Find the new event in the authoritative store.
      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/events?search=${encodeURIComponent(eventName)}`,
      );
      const created = ((await listAfterCreate.json()) as { items: ApiEvent[] })
        .items[0];
      expect(created, "created event should be readable").toBeTruthy();
      const eventId = created!.id;
      expect(created).toMatchObject({
        name: eventName,
        eventType: "CORPORATE_EVENT",
        status: "PLANNING",
        manager: { id: managerId },
        teams: [],
      });

      const createdRows = await queryInSchema<{
        event_type: string;
        status: string;
        workspace_id: string;
      }>(
        runDatabaseUrl(),
        `SELECT event_type, status, workspace_id FROM events WHERE id = $1`,
        [eventId],
      );
      expect(createdRows).toEqual([
        {
          event_type: "CORPORATE_EVENT",
          status: "PLANNING",
          workspace_id: created!.workspaceId,
        },
      ]);

      // Open the detail dialog and assign the team. (The list renders both a
      // desktop row and a mobile card; only one is in the a11y tree at the
      // test viewport, but `.first()` keeps this stable regardless.)
      await page.getByRole("button", { name: eventName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: eventName }),
      ).toBeVisible();

      await detail.getByRole("combobox", { name: "Assign a team" }).click();
      await page.getByRole("option", { name: teamName, exact: true }).click();
      await expect(detail.getByText(teamName, { exact: true })).toBeVisible();

      const joinRows = await queryInSchema<{ team_id: string }>(
        runDatabaseUrl(),
        `SELECT team_id
           FROM workspace_teams
          WHERE workspace_id = $1`,
        [created!.workspaceId],
      );
      expect(joinRows).toEqual([{ team_id: teamId }]);

      // Set a budget.
      await detail.getByLabel("Amount").fill("15000");
      await detail.getByLabel("Currency").fill("USD");
      await detail.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        detail.getByText("Current: 15000.00 USD", { exact: true }),
      ).toBeVisible();

      // Move through the approved lifecycle graph, cross-checking the
      // authoritative status after each move (the UI resets its picker to a
      // placeholder rather than showing the current value).
      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page.getByRole("option", { name: "Ready", exact: true }).click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/events/${eventId}`,
          );
          return ((await response.json()) as ApiEvent).status;
        })
        .toBe("READY");

      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page
        .getByRole("option", { name: "In progress", exact: true })
        .click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/events/${eventId}`,
          );
          return ((await response.json()) as ApiEvent).status;
        })
        .toBe("IN_PROGRESS");

      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      // A terminal state has no further moves: the picker is replaced by text.
      await expect(
        detail.getByText("Completed is a final state.", { exact: true }),
      ).toBeVisible();

      // Edit the event's details.
      const renamedTo = `${eventName} Renamed`;
      await detail.getByRole("textbox", { name: "Name" }).fill(renamedTo);
      await detail
        .getByRole("button", { name: "Save details", exact: true })
        .click();
      await expect(
        detail.getByRole("heading", { name: renamedTo }),
      ).toBeVisible();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(eventCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: renamedTo }).first().click();
      const reopened = page.getByRole("dialog");
      await expect(
        reopened.getByRole("heading", { name: renamedTo }),
      ).toBeVisible();
      await expect(
        reopened.getByText("Completed is a final state.", { exact: true }),
      ).toBeVisible();
      await expect(reopened.getByText(teamName, { exact: true })).toBeVisible();
      await expect(
        reopened.getByText("Current: 15000.00 USD", { exact: true }),
      ).toBeVisible();

      // Highest-risk business-rule failure: a completed event cannot move
      // again, enforced server-side regardless of what the UI offers.
      const invalidMove = await page.request.post(
        `${apiBaseUrl}/api/v1/events/${eventId}/transition`,
        {
          headers: { "x-csrf-token": csrf },
          data: { status: "IN_PROGRESS" },
        },
      );
      expect(invalidMove.status()).toBe(409);
      expect((await invalidMove.json()) as { code: string }).toMatchObject({
        code: "EVENT_INVALID_TRANSITION",
      });

      // Unassign the team and clear the budget through the UI.
      await reopened
        .getByRole("button", { name: `Unassign ${teamName}` })
        .click();
      await expect(reopened.getByText("No teams assigned.")).toBeVisible();
      await reopened
        .getByRole("button", { name: "Clear", exact: true })
        .click();
      await expect(
        reopened.getByText("Current: —", { exact: true }),
      ).toBeVisible();

      const clearedTeams = await queryInSchema(
        runDatabaseUrl(),
        `SELECT team_id FROM workspace_teams WHERE workspace_id = $1`,
        [created!.workspaceId],
      );
      expect(clearedTeams).toHaveLength(0);
      const clearedBudget = await queryInSchema<{
        budget_amount: string | null;
        budget_currency: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT budget_amount, budget_currency FROM events WHERE id = $1`,
        [eventId],
      );
      expect(clearedBudget).toEqual([
        { budget_amount: null, budget_currency: null },
      ]);

      // Delete the event through the inline confirm.
      await reopened.getByRole("button", { name: "Delete event" }).click();
      await reopened.getByRole("button", { name: "Confirm delete" }).click();

      await expect(
        page.getByText(eventCount(baseline), { exact: true }),
      ).toBeVisible();
      const afterDelete = await page.request.get(
        `${apiBaseUrl}/api/v1/events/${eventId}`,
      );
      expect(afterDelete.status()).toBe(404);
      const goneRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM events WHERE id = $1`,
        [eventId],
      );
      expect(goneRows).toHaveLength(0);
      // The event's connected workspace is removed with it.
      const workspaceGone = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM workspaces WHERE id = $1`,
        [created!.workspaceId],
      );
      expect(workspaceGone).toHaveLength(0);
      // The team it referenced survives; only the join row was removed.
      const teamStillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(teamStillThere).toHaveLength(1);
    });
  });

  test.describe("privileged but not omnipotent journey", () => {
    // Management/Administrator holds every event.* key at organization scope
    // except event.delete.
    test.use({ storageState: authStatePath("manager") });

    test("a manager can create, assign, transition, and budget but cannot delete an event", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);

      const eventName = `E2E No Delete ${randomUUID().slice(0, 8)}`;
      const create = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": csrf },
        data: { name: eventName, eventType: "CONCERT" },
      });
      expect(create.status()).toBe(201);
      const eventId = ((await create.json()) as { id: string }).id;

      // The manager can move the event and set its budget through the API
      // (the same routes the UI drives).
      const transition = await page.request.post(
        `${apiBaseUrl}/api/v1/events/${eventId}/transition`,
        { headers: { "x-csrf-token": csrf }, data: { status: "READY" } },
      );
      expect(transition.status()).toBe(200);
      const budget = await page.request.put(
        `${apiBaseUrl}/api/v1/events/${eventId}/budget`,
        {
          headers: { "x-csrf-token": csrf },
          data: { amount: 500, currency: "EUR" },
        },
      );
      expect(budget.status()).toBe(200);

      // The detail dialog offers no delete affordance for this account, but
      // the budget editor is present - the manager holds both budget keys,
      // only event.delete is absent.
      await page.goto("/events");
      await page.getByRole("button", { name: eventName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: eventName }),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "Delete event" }),
      ).toHaveCount(0);
      await expect(
        detail.getByText("Current: 500.00 EUR", { exact: true }),
      ).toBeVisible();

      // Highest-risk failure path: a direct, correctly-formed delete is
      // refused with a stable code and the row survives.
      const blocked = await page.request.delete(
        `${apiBaseUrl}/api/v1/events/${eventId}`,
        { headers: { "x-csrf-token": csrf } },
      );
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const stillThere = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM events WHERE id = $1`,
        [eventId],
      );
      expect(stillThere).toHaveLength(1);

      // Clean up as an admin so the caption is not left inflated for reruns.
      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const adminCsrf = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      const cleanup = await admin.delete(
        `${apiBaseUrl}/api/v1/events/${eventId}`,
        { headers: { "x-csrf-token": adminCsrf as string } },
      );
      expect(cleanup.status()).toBe(204);
      await admin.dispose();
    });
  });

  test.describe("denied journey", () => {
    // A Department Manager holds event.read at DEPARTMENT scope only. Event
    // reads are organization-scoped, so the surface is fully denied.
    test.use({ storageState: authStatePath("deptManager") });

    test("a department-scoped account cannot see, open, or drive event management", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Events" })).toHaveCount(0);

      await page.goto("/events");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Filter by status" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New event" })).toHaveCount(
        0,
      );

      const list = await page.request.get(`${apiBaseUrl}/api/v1/events`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const deniedName = `E2E Denied ${randomUUID().slice(0, 8)}`;
      const attempt = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: { name: deniedName, eventType: "OTHER" },
      });
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM events WHERE name = $1`,
        [deniedName],
      );
      expect(leaked).toHaveLength(0);

      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
    });
  });
});
