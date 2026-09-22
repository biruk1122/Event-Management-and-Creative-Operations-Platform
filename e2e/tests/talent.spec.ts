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

/** The list caption renders `N talent` / `N talents`. */
function talentCount(total: number): string {
  return `${total} talent${total === 1 ? "" : "s"}`;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

interface ApiTalent {
  id: string;
  fullName: string;
  type: string;
  availability: string;
  manager: { id: string; email: string } | null;
  socialLinks: { id: string; label: string; url: string }[];
  schedules: { id: string; title: string; startAt: string; endAt: string }[];
  eventAssignments: {
    id: string;
    event: { id: string; name: string };
    role: string;
    status: string;
  }[];
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

test.describe("Talent management — end to end", () => {
  // Talent's RBAC surface has no middle tier: Management/Administrator holds
  // no talent.* grants at all, and the dedicated "Talent Manager" role
  // already holds every talent.* key with no gaps - so the principal whose
  // lifecycle matters here is Talent Manager, not Super Admin.
  test.describe("Talent Manager journey", () => {
    test.use({ storageState: authStatePath("talentManager") });

    test("creates a talent, assigns a manager, manages schedules and social links, assigns to an event, moves through availability and assignment lifecycles, persists through reload, then removes a schedule and a social link", async ({
      page,
    }) => {
      // A random tail on top of the run-scoped name so a Playwright retry,
      // which restarts the fixture sequence in a fresh worker, cannot
      // collide with the failed attempt's still-present records.
      const suffix = `${fixtureName("talent")}-${randomUUID().slice(0, 8)}`;
      const csrf = await csrfToken(page);
      const talentName = `E2E Talent ${suffix}`;
      const eventName = `E2E TAL Related Event ${suffix}`;
      const managerEmail = "member@e2e.test";
      const socialUrl = `https://instagram.com/${suffix}`;

      // Talent Manager holds no event.* grants (only the event.read this
      // suite's RBAC fix added, so the assignment picker can list events -
      // creating one is rightly out of scope for this role), so the
      // prerequisite event is created through a separate Super Admin
      // context rather than this test's own `page`.
      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const adminCsrf = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      const eventResponse = await admin.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": adminCsrf as string },
        data: { name: eventName, eventType: "OTHER" },
      });
      expect(eventResponse.status()).toBe(201);
      const eventId = ((await eventResponse.json()) as { id: string }).id;
      await admin.dispose();
      const managerId = await userIdByEmail(page, managerEmail);

      // The account holds talent.read at organization scope, so the nav
      // entry shows.
      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Talent" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/talent");
      await expect(
        page.getByRole("heading", { level: 1, name: "Talent" }),
      ).toBeVisible();

      // The list renders from authoritative API data.
      const before = await page.request.get(`${apiBaseUrl}/api/v1/talents`);
      expect(before.ok()).toBe(true);
      const baseline = ((await before.json()) as { total: number }).total;
      await expect(
        page.getByText(talentCount(baseline), { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "talent list");

      // Create a talent through the dialog, including its manager.
      await page.getByRole("button", { name: "New talent" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New talent" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "create talent dialog");

      await createDialog.getByLabel("Full name").fill(talentName);
      await createDialog.getByRole("combobox", { name: "Type" }).click();
      await page.getByRole("option", { name: "Musician", exact: true }).click();
      await createDialog
        .getByRole("combobox", { name: "Manager (optional)" })
        .click();
      await page
        .getByRole("option", { name: managerEmail, exact: true })
        .click();
      await createDialog.getByRole("button", { name: "Create talent" }).click();

      await expect(
        page.getByText(talentCount(baseline + 1), { exact: true }),
      ).toBeVisible();

      // Find the new talent in the authoritative store.
      const listAfterCreate = await page.request.get(
        `${apiBaseUrl}/api/v1/talents?search=${encodeURIComponent(talentName)}`,
      );
      const created = ((await listAfterCreate.json()) as { items: ApiTalent[] })
        .items[0];
      expect(created, "created talent should be readable").toBeTruthy();
      const talentId = created!.id;
      expect(created).toMatchObject({
        fullName: talentName,
        type: "MUSICIAN",
        availability: "AVAILABLE",
        manager: { id: managerId },
      });

      const createdRows = await queryInSchema<{
        full_name: string;
        type: string;
        availability: string;
        manager_id: string;
      }>(
        runDatabaseUrl(),
        `SELECT full_name, type, availability, manager_id FROM talents WHERE id = $1`,
        [talentId],
      );
      expect(createdRows).toEqual([
        {
          full_name: talentName,
          type: "MUSICIAN",
          availability: "AVAILABLE",
          manager_id: managerId,
        },
      ]);

      // Open the detail dialog. (The list renders both a desktop row and a
      // mobile card; only one is in the a11y tree at the test viewport, but
      // `.first()` keeps this stable regardless.)
      await page.getByRole("button", { name: talentName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: talentName }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "talent detail dialog");

      // Add a social link, then a highest-risk failure path: a duplicate
      // url for the same talent is refused, both through the UI and the API
      // it drives.
      await detail.getByRole("button", { name: "Add social link" }).click();
      const socialForm = detail.getByRole("form", { name: "Add social link" });
      await socialForm.getByLabel("Label").fill("Instagram");
      await socialForm.getByLabel("URL").fill(socialUrl);
      await socialForm.getByRole("button", { name: "Add link" }).click();
      await expect(
        detail.getByText("Instagram", { exact: true }),
      ).toBeVisible();

      const linkRows = await queryInSchema<{ url: string }>(
        runDatabaseUrl(),
        `SELECT url FROM talent_social_links WHERE talent_id = $1`,
        [talentId],
      );
      expect(linkRows).toEqual([{ url: socialUrl }]);

      const duplicateLink = await page.request.post(
        `${apiBaseUrl}/api/v1/talents/${talentId}/social-links`,
        {
          headers: { "x-csrf-token": csrf },
          data: { label: "Instagram again", url: socialUrl },
        },
      );
      expect(duplicateLink.status()).toBe(409);
      expect((await duplicateLink.json()) as { code: string }).toMatchObject({
        code: "TALENT_SOCIAL_LINK_CONFLICT",
      });
      const stillOneLink = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM talent_social_links WHERE talent_id = $1`,
        [talentId],
      );
      expect(stillOneLink).toHaveLength(1);

      // Add a schedule entry.
      await detail.getByRole("button", { name: "Add schedule entry" }).click();
      const scheduleForm = detail.getByRole("form", {
        name: "New schedule entry",
      });
      await scheduleForm.getByLabel("Title").fill("Sound check");
      await scheduleForm.getByLabel("Starts (UTC)").fill("2027-06-01T10:00");
      await scheduleForm.getByLabel("Ends (UTC)").fill("2027-06-01T11:00");
      await scheduleForm.getByRole("button", { name: "Add entry" }).click();
      await expect(
        detail.getByText("Sound check", { exact: true }),
      ).toBeVisible();

      const scheduleRows = await queryInSchema<{ title: string }>(
        runDatabaseUrl(),
        `SELECT title FROM talent_schedules WHERE talent_id = $1`,
        [talentId],
      );
      expect(scheduleRows).toEqual([{ title: "Sound check" }]);

      // Assign the talent to the event created above.
      await detail.getByRole("button", { name: "Assign to an event" }).click();
      const assignForm = detail.getByRole("form", {
        name: "Assign to an event",
      });
      await assignForm.getByRole("combobox", { name: "Event" }).click();
      await page.getByRole("option", { name: eventName, exact: true }).click();
      await assignForm.getByLabel("Role").fill("Headliner");
      await assignForm.getByRole("button", { name: "Assign" }).click();
      // The form's own Select shows the chosen event's name as its closed
      // value, which is exact-text-identical to the new row `Assign` is
      // about to add - wait for the form to actually unmount before
      // asserting on that text, or the two can transiently coexist and
      // violate Playwright's strict mode.
      await expect(assignForm).toHaveCount(0);
      await expect(detail.getByText(eventName, { exact: true })).toBeVisible();

      const assignmentRows = await queryInSchema<{
        event_id: string;
        role: string;
        status: string;
      }>(
        runDatabaseUrl(),
        `SELECT event_id, role, status FROM event_talents WHERE talent_id = $1`,
        [talentId],
      );
      expect(assignmentRows).toEqual([
        { event_id: eventId, role: "Headliner", status: "ASSIGNED" },
      ]);

      // Move the assignment to COMPLETED, a terminal state: the status
      // control disappears once there are no further moves.
      await detail
        .getByRole("combobox", { name: `Move ${eventName} assignment to` })
        .click();
      await page
        .getByRole("option", { name: "Completed", exact: true })
        .click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/talents/${talentId}`,
          );
          return ((await response.json()) as ApiTalent).eventAssignments[0]
            ?.status;
        })
        .toBe("COMPLETED");
      await expect(
        detail.getByRole("combobox", {
          name: `Move ${eventName} assignment to`,
        }),
      ).toHaveCount(0);

      // Move through the availability lifecycle graph, cross-checking the
      // authoritative status after each move (the UI resets its picker to a
      // placeholder rather than showing the current value).
      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page.getByRole("option", { name: "Assigned", exact: true }).click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/talents/${talentId}`,
          );
          return ((await response.json()) as ApiTalent).availability;
        })
        .toBe("ASSIGNED");

      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page
        .getByRole("option", { name: "Unavailable", exact: true })
        .click();
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/talents/${talentId}`,
          );
          return ((await response.json()) as ApiTalent).availability;
        })
        .toBe("UNAVAILABLE");

      // Highest-risk business-rule failure: ASSIGNED is not reachable from
      // UNAVAILABLE (only AVAILABLE and INACTIVE are), enforced server-side
      // regardless of what the UI offers.
      const invalidMove = await page.request.post(
        `${apiBaseUrl}/api/v1/talents/${talentId}/transition`,
        {
          headers: { "x-csrf-token": csrf },
          data: { availability: "ASSIGNED" },
        },
      );
      expect(invalidMove.status()).toBe(409);
      expect((await invalidMove.json()) as { code: string }).toMatchObject({
        code: "TALENT_AVAILABILITY_TRANSITION_INVALID",
      });

      await detail.getByRole("combobox", { name: "Move to" }).click();
      await page.getByRole("option", { name: "Inactive", exact: true }).click();
      // A terminal state has no further moves: the picker is replaced by text.
      await expect(
        detail.getByText("Inactive is a final state.", { exact: true }),
      ).toBeVisible();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await expect(
        page.getByText(talentCount(baseline + 1), { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: talentName }).first().click();
      const reopened = page.getByRole("dialog");
      await expect(
        reopened.getByRole("heading", { name: talentName }),
      ).toBeVisible();
      await expect(
        reopened.getByText("Inactive is a final state.", { exact: true }),
      ).toBeVisible();
      await expect(
        reopened.getByText("Instagram", { exact: true }),
      ).toBeVisible();
      await expect(
        reopened.getByText("Sound check", { exact: true }),
      ).toBeVisible();
      await expect(
        reopened.getByText(eventName, { exact: true }),
      ).toBeVisible();

      // Remove the social link and the schedule entry through the UI; both
      // must actually disappear from the list, not merely report success
      // (EVE-138's #90 fix - the sections update their own local state since
      // DELETE returns no body to reconcile through).
      await reopened.getByRole("button", { name: "Remove Instagram" }).click();
      await expect(
        reopened.getByText("Instagram", { exact: true }),
      ).not.toBeVisible();
      const linksGone = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM talent_social_links WHERE talent_id = $1`,
        [talentId],
      );
      expect(linksGone).toHaveLength(0);

      await reopened
        .getByRole("button", { name: "Remove Sound check" })
        .click();
      await reopened
        .getByRole("button", { name: "Confirm remove Sound check" })
        .click();
      await expect(
        reopened.getByText("Sound check", { exact: true }),
      ).not.toBeVisible();
      const schedulesGone = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM talent_schedules WHERE talent_id = $1`,
        [talentId],
      );
      expect(schedulesGone).toHaveLength(0);
    });
  });

  test.describe("denied journey", () => {
    // Management/Administrator holds no talent.* grants at all - Talent's
    // surface is fully denied to every role except Super Admin and the
    // dedicated Talent Manager role, so this account works as well as
    // `member` would for proving denial. `member`'s saved session is
    // invalidated by `auth-session.spec.ts` (runs earlier), so the denied
    // journey uses an account no other spec signs out.
    test.use({ storageState: authStatePath("manager") });

    test("a caller without talent grants cannot see, open, or drive talent management", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Talent" })).toHaveCount(0);

      await page.goto("/talent");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Filter by type" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New talent" }),
      ).toHaveCount(0);

      const list = await page.request.get(`${apiBaseUrl}/api/v1/talents`);
      expect(list.status()).toBe(403);

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const deniedName = `E2E Denied ${randomUUID().slice(0, 8)}`;
      const attempt = await page.request.post(`${apiBaseUrl}/api/v1/talents`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: { fullName: deniedName, type: "MUSICIAN" },
      });
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM talents WHERE full_name = $1`,
        [deniedName],
      );
      expect(leaked).toHaveLength(0);

      const me = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`);
      expect(me.status()).toBe(200);
    });
  });
});
