import { randomUUID } from "node:crypto";

import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

async function csrfTokenOf(requester: APIRequestContext): Promise<string> {
  const token = (await requester.storageState()).cookies.find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

async function roleIdByName(
  admin: APIRequestContext,
  name: string,
): Promise<string> {
  const response = await admin.get(`${apiBaseUrl}/api/v1/roles`);
  expect(response.ok()).toBe(true);
  const roles = (await response.json()) as { id: string; name: string }[];
  const role = roles.find((candidate) => candidate.name === name);
  expect(role, `role "${name}" should exist`).toBeTruthy();
  return role!.id;
}

interface ApiDepartment {
  id: string;
  name: string;
}

interface ApiEvent {
  id: string;
  name: string;
  departmentId: string | null;
}

interface ApiExpenseReview {
  outcome: "APPROVED" | "REJECTED";
  note: string | null;
}

interface ApiExpense {
  id: string;
  eventId: string;
  departmentId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  reviews: ApiExpenseReview[];
}

interface ApiMeeting {
  id: string;
  agenda: string | null;
  minutes: string | null;
}

/**
 * Creates a disposable Department Manager through the real API, assigned to
 * the given department - a clean, throwaway account rather than the shared
 * `deptManager`/`manager`/`talentManager` fixtures, whose own department
 * assignment is mutated by other specs (notably departments-admin.spec.ts)
 * and therefore cannot be relied on to stay put across the suite.
 */
async function createDepartmentManager(
  admin: APIRequestContext,
  adminHeaders: Record<string, string>,
  departmentId: string,
  label: string,
): Promise<{ id: string; email: string }> {
  const roleId = await roleIdByName(admin, "Department Manager");
  const suffix = randomUUID().slice(0, 8);
  const email = `eom-${label}-${suffix}@e2e.test`;
  // A Department Manager/Member role requires a department in the same
  // request - `UsersService.validateAssignment` rejects a role without one.
  const create = await admin.post(`${apiBaseUrl}/api/v1/users`, {
    headers: adminHeaders,
    data: {
      email,
      firstName: "EOM",
      lastName: `Manager ${label} ${suffix}`,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId,
      departmentId,
    },
  });
  expect(create.status()).toBe(201);
  const userId = ((await create.json()) as { id: string }).id;

  return { id: userId, email };
}

test.describe("Event & Office Manager workspace — end to end", () => {
  test("a Department Manager runs an event through its budget, expense approval, and meeting workflow, isolated from other departments", async ({
    browser,
  }) => {
    // A long multi-actor, multi-screen journey (event, expense approval
    // across two sessions, meeting agenda/minutes/action-item, then a
    // cross-department denial check) needs more than the suite's default
    // test timeout.
    test.setTimeout(60_000);

    const suffix = `${fixtureName("eom")}-${randomUUID().slice(0, 8)}`;
    const homeDepartmentName = "Manager / Event & Office Manager";
    const otherDepartmentName = "Marketing";
    const eventName = `EOM Launch ${suffix}`;
    const meetingTitle = `EOM Kickoff ${suffix}`;
    const actionItemTitle = `Confirm venue permits ${suffix}`;

    const admin = await request.newContext({
      storageState: authStatePath("superAdmin"),
    });
    const adminHeaders = { "x-csrf-token": await csrfTokenOf(admin) };

    // A Department Manager/Member role requires an active *platform*
    // department (`supportedDepartment()` - one of exactly the four named
    // rows the department-rbac migration seeds), so this test uses two of
    // those real departments rather than creating throwaway ones.
    const departmentsLookup = await admin.get(
      `${apiBaseUrl}/api/v1/departments`,
      {
        params: { pageSize: 100 },
      },
    );
    const departmentList = (
      (await departmentsLookup.json()) as { items: ApiDepartment[] }
    ).items;
    const homeDeptId = departmentList.find(
      (department) => department.name === homeDepartmentName,
    )?.id;
    const otherDeptId = departmentList.find(
      (department) => department.name === otherDepartmentName,
    )?.id;
    expect(
      homeDeptId,
      `"${homeDepartmentName}" department should be seeded`,
    ).toBeTruthy();
    expect(
      otherDeptId,
      `"${otherDepartmentName}" department should be seeded`,
    ).toBeTruthy();

    const homeManager = await createDepartmentManager(
      admin,
      adminHeaders,
      homeDeptId!,
      "home",
    );
    const otherManager = await createDepartmentManager(
      admin,
      adminHeaders,
      otherDeptId!,
      "other",
    );

    // --- The home department's manager drives the workspace through the UI ---
    const homePage = await browser.newPage();
    await signInThroughUi(homePage, {
      key: "eom-home-manager",
      email: homeManager.email,
      password: TEST_USER_PASSWORD,
      role: "Department Manager",
      firstName: "EOM",
      lastName: "Home Manager",
    });
    const homeCsrf = (await homePage.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )?.value as string;
    expect(
      homeCsrf,
      "home manager csrf_token cookie should be present",
    ).toBeTruthy();

    // Create an event. EOM-01: departmentId is resolved server-side from the
    // acting manager's own department, never from client input.
    await homePage.goto("/events");
    await expect(
      homePage.getByRole("heading", { level: 1, name: "Events" }),
    ).toBeVisible();
    await homePage.getByRole("button", { name: "New event" }).click();
    const createEventDialog = homePage.getByRole("dialog");
    await createEventDialog
      .getByRole("textbox", { name: "Name" })
      .fill(eventName);
    await createEventDialog
      .getByRole("button", { name: "Create event" })
      .click();
    await expect(
      homePage.getByRole("button", { name: eventName }).first(),
    ).toBeVisible();

    const eventLookup = await homePage.request.get(
      `${apiBaseUrl}/api/v1/events?search=${encodeURIComponent(eventName)}`,
    );
    const createdEvent = (
      (await eventLookup.json()) as { items: ApiEvent[] }
    ).items.find((event) => event.name === eventName);
    expect(createdEvent, "created event should be readable").toBeTruthy();
    const eventId = createdEvent!.id;
    expect(createdEvent!.departmentId).toBe(homeDeptId);

    // The event's detail dialog shows the resolved department name.
    await homePage.getByRole("button", { name: eventName }).first().click();
    const eventDetail = homePage.getByRole("dialog");
    await expect(
      eventDetail.getByText(`Department: ${homeDepartmentName}`, {
        exact: true,
      }),
    ).toBeVisible();
    await homePage.keyboard.press("Escape");

    // Create an expense for that event, then submit it for approval. A
    // Department Manager holds expense.submit but never expense.approve
    // (Super Admin only, by construction - see expense-access.ts).
    await homePage.goto("/expenses");
    await expect(
      homePage.getByRole("heading", { level: 1, name: "Expenses" }),
    ).toBeVisible();
    await homePage.getByRole("button", { name: "New expense" }).click();
    const createExpenseDialog = homePage.getByRole("dialog");
    await createExpenseDialog.getByRole("combobox", { name: "Event" }).click();
    await homePage
      .getByRole("option", { name: eventName, exact: true })
      .click();
    await createExpenseDialog
      .getByLabel("Description")
      .fill("Stage lighting rental");
    await createExpenseDialog.getByLabel("Actual amount").fill("1200");
    await createExpenseDialog.getByLabel("Currency").fill("USD");
    await createExpenseDialog
      .getByRole("button", { name: "Create expense" })
      .click();
    await expect(
      homePage.getByRole("button", { name: "Stage lighting rental" }).first(),
    ).toBeVisible();

    const expenseLookup = await homePage.request.get(
      `${apiBaseUrl}/api/v1/expenses?eventId=${eventId}`,
    );
    const createdExpense = (
      (await expenseLookup.json()) as { items: ApiExpense[] }
    ).items[0];
    expect(createdExpense, "created expense should be readable").toBeTruthy();
    const expenseId = createdExpense!.id;
    expect(createdExpense!.status).toBe("DRAFT");
    expect(createdExpense!.departmentId).toBe(homeDeptId);

    await homePage
      .getByRole("button", { name: "Stage lighting rental" })
      .first()
      .click();
    const expenseDetail = homePage.getByRole("dialog");
    await expect(
      expenseDetail.getByRole("button", { name: "Submit for approval" }),
    ).toBeVisible();
    await expect(
      expenseDetail.getByRole("button", { name: "Approve" }),
    ).toHaveCount(0);
    await expenseDetail
      .getByRole("button", { name: "Submit for approval" })
      .click();
    await expect(
      expenseDetail.getByText("Pending approval", { exact: true }),
    ).toBeVisible();
    await homePage.keyboard.press("Escape");

    const afterSubmit = await homePage.request.get(
      `${apiBaseUrl}/api/v1/expenses/${expenseId}`,
    );
    expect(((await afterSubmit.json()) as ApiExpense).status).toBe("SUBMITTED");

    // --- Super Admin approves the expense in their own session ---
    const adminContext = await browser.newContext({
      storageState: authStatePath("superAdmin"),
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/expenses");
    // A Super Admin holds expense.read/expense.approve at organization
    // scope, so every department's expenses are visible here.
    await adminPage
      .getByRole("button", { name: "Stage lighting rental" })
      .first()
      .click();
    const reviewDetail = adminPage.getByRole("dialog");
    await expect(
      reviewDetail.getByRole("button", { name: "Approve" }),
    ).toBeVisible();
    await reviewDetail
      .getByLabel("Note (optional)")
      .fill("Approved for the launch budget.");
    await reviewDetail.getByRole("button", { name: "Approve" }).click();
    await expect(
      reviewDetail.getByText("Approved", { exact: true }).first(),
    ).toBeVisible();
    await adminContext.close();

    const afterReview = await homePage.request.get(
      `${apiBaseUrl}/api/v1/expenses/${expenseId}`,
    );
    const reviewed = (await afterReview.json()) as ApiExpense;
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.reviews).toEqual([
      expect.objectContaining({
        outcome: "APPROVED",
        note: "Approved for the launch budget.",
      }),
    ]);

    // Pending expenses are never counted as approved spend: the planned-vs-
    // actual summary separates the two explicitly.
    const budgetSummary = await homePage.request.get(
      `${apiBaseUrl}/api/v1/events/${eventId}/budget-summary`,
    );
    expect(budgetSummary.ok()).toBe(true);
    expect((await budgetSummary.json()) as unknown).toMatchObject({
      actualApproved: "1200.00",
      actualPending: "0.00",
    });

    // --- A meeting with an agenda, recorded minutes, and an action item ---
    const createMeeting = await homePage.request.post(
      `${apiBaseUrl}/api/v1/meetings`,
      {
        headers: { "x-csrf-token": homeCsrf },
        data: {
          title: meetingTitle,
          type: "ONLINE",
          startAt: new Date(Date.now() + 3_600_000).toISOString(),
          endAt: new Date(Date.now() + 7_200_000).toISOString(),
          agenda: "Review launch readiness and outstanding risks.",
        },
      },
    );
    expect(createMeeting.status()).toBe(201);
    const meetingId = ((await createMeeting.json()) as { id: string }).id;

    await homePage.goto("/meetings");
    await homePage
      .getByRole("button", { name: new RegExp(meetingTitle) })
      .click();
    await expect(
      homePage.getByRole("heading", { name: meetingTitle }),
    ).toBeVisible();
    await expect(
      homePage.getByText("Review launch readiness and outstanding risks.", {
        exact: true,
      }),
    ).toBeVisible();

    const minutesText = "Launch is on track; one risk flagged on staging.";
    await homePage.getByLabel("Minutes").fill(minutesText);
    await homePage.getByRole("button", { name: "Save minutes" }).click();
    await expect(homePage.getByText("Minutes saved.")).toBeVisible();

    await homePage.getByRole("button", { name: "Add action item" }).click();
    await homePage.getByLabel("Title").fill(actionItemTitle);
    await homePage.getByRole("button", { name: "Add", exact: true }).click();
    await expect(homePage.getByText("Action item created.")).toBeVisible();

    const meetingAfter = await homePage.request.get(
      `${apiBaseUrl}/api/v1/meetings/${meetingId}`,
    );
    const meetingState = (await meetingAfter.json()) as ApiMeeting;
    expect(meetingState.minutes).toBe(minutesText);

    const actionItemRows = await queryInSchema<{
      title: string;
      department_id: string;
      source_meeting_id: string;
    }>(
      runDatabaseUrl(),
      `SELECT title, department_id, source_meeting_id FROM tasks WHERE source_meeting_id = $1`,
      [meetingId],
    );
    expect(actionItemRows).toEqual([
      {
        title: actionItemTitle,
        department_id: homeDeptId,
        source_meeting_id: meetingId,
      },
    ]);

    // --- Department isolation: a different department's manager cannot see
    // this department's event or expense, directly or through the UI ---
    const otherPage = await browser.newPage();
    await signInThroughUi(otherPage, {
      key: "eom-other-manager",
      email: otherManager.email,
      password: TEST_USER_PASSWORD,
      role: "Department Manager",
      firstName: "EOM",
      lastName: "Other Manager",
    });

    // A department-scoped (not organization-scoped) caller gets 403, not 404,
    // for a record outside their department - `loadAuthorized`/`load` cannot
    // distinguish "does not exist" from "exists but is not visible to you"
    // once the visibility-filtered query returns nothing, and a
    // department-scoped grant always resolves to the stricter, never-leak
    // answer (see events.service.ts/expenses.service.ts `loadAuthorized`).
    await otherPage.goto("/events");
    await expect(
      otherPage.getByRole("button", { name: eventName }),
    ).toHaveCount(0);
    const otherEventRead = await otherPage.request.get(
      `${apiBaseUrl}/api/v1/events/${eventId}`,
    );
    expect(otherEventRead.status()).toBe(403);

    await otherPage.goto("/expenses");
    await expect(
      otherPage.getByRole("button", { name: "Stage lighting rental" }),
    ).toHaveCount(0);
    const otherExpenseRead = await otherPage.request.get(
      `${apiBaseUrl}/api/v1/expenses/${expenseId}`,
    );
    expect(otherExpenseRead.status()).toBe(403);

    // Highest-risk path: a direct, correctly-formed cross-department
    // approval attempt is refused with a stable code and writes nothing -
    // department.read `expense.approve` is Super Admin-only regardless.
    const otherCsrf = (await otherPage.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )?.value as string;
    const deniedApproval = await otherPage.request.post(
      `${apiBaseUrl}/api/v1/expenses/${expenseId}/reviews`,
      {
        headers: { "x-csrf-token": otherCsrf },
        data: { outcome: "APPROVED" },
      },
    );
    expect(deniedApproval.status()).toBe(403);
    expect((await deniedApproval.json()) as { code: string }).toMatchObject({
      code: "PERMISSION_DENIED",
    });
    const stillApproved = await queryInSchema<{ status: string }>(
      runDatabaseUrl(),
      `SELECT status FROM expenses WHERE id = $1`,
      [expenseId],
    );
    expect(stillApproved).toEqual([{ status: "APPROVED" }]);

    await otherPage.close();
    await homePage.close();
    await admin.dispose();
  });
});
