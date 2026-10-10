import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

type ReportType = "DAILY" | "WEEKLY" | "MONTHLY";
type ReportStatus = "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "REVIEWED";
interface Report {
  id: string;
  title: string;
  type: ReportType;
  status: ReportStatus;
  authorId: string;
  periodStart: string;
  periodEnd: string;
  workspaceIds: string[];
  facts?: {
    completedTasksInPeriod: number;
    inProgressTasksNow: number;
    pendingTasksNow: number;
    overdueTasksNow: number;
    totalProjectsNow: number | null;
  };
}

const reportsUrl = `${apiBaseUrl}/api/v1/reports`;

function databaseUrl(): string {
  if (!process.env.DATABASE_URL) throw new Error("E2E database URL is missing");
  return process.env.DATABASE_URL;
}

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token).toBeTruthy();
  return token!;
}

async function createReportUser(
  admin: Page,
  roleName: "Team Member" | "Super Admin" = "Team Member",
) {
  const suffix = randomUUID().slice(0, 8);
  const email = `report-${suffix}@e2e.test`;
  const rolesResponse = await admin.request.get(`${apiBaseUrl}/api/v1/roles`);
  expect(rolesResponse.ok()).toBe(true);
  const roles = (await rolesResponse.json()) as { id: string; name: string }[];
  const roleId = roles.find((role) => role.name === roleName)?.id;
  expect(roleId).toBeTruthy();
  const response = await admin.request.post(`${apiBaseUrl}/api/v1/users`, {
    headers: { "x-csrf-token": await csrfToken(admin) },
    data: {
      email,
      firstName: "Report",
      lastName: suffix,
      temporaryPassword: TEST_USER_PASSWORD,
      roleId,
    },
  });
  expect(response.status()).toBe(201);
  return {
    id: ((await response.json()) as { id: string }).id,
    user: {
      key: `report-${suffix}`,
      email,
      password: TEST_USER_PASSWORD,
      role: roleName,
      firstName: "Report",
      lastName: suffix,
    },
  };
}

async function reportByTitle(
  page: Page,
  title: string,
  authorId: string,
): Promise<Report> {
  const response = await page.request.get(`${reportsUrl}?authorId=${authorId}`);
  expect(response.ok()).toBe(true);
  const list = (await response.json()) as { items: Report[] };
  const report = list.items.find((item) => item.title === title);
  expect(
    report,
    `Report ${title} should be in the authoritative list`,
  ).toBeTruthy();
  return report!;
}

test.describe("Reporting — end to end", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("an employee authors all periods and management reviews an authorized report", async ({
    page: admin,
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { id: authorId, user } = await createReportUser(admin);
    const csrf = await csrfToken(admin);
    const departmentResponse = await admin.request.post(
      `${apiBaseUrl}/api/v1/departments`,
      {
        headers: { "x-csrf-token": csrf },
        data: { name: `E2E report department ${user.lastName}` },
      },
    );
    expect(departmentResponse.status()).toBe(201);
    const departmentId = ((await departmentResponse.json()) as { id: string })
      .id;
    const taskResponse = await admin.request.post(
      `${apiBaseUrl}/api/v1/tasks`,
      {
        headers: { "x-csrf-token": csrf },
        data: {
          title: `E2E report task ${user.lastName}`,
          departmentId,
          dueAt: "2024-01-01T00:00:00.000Z",
        },
      },
    );
    expect(taskResponse.status()).toBe(201);
    const taskId = ((await taskResponse.json()) as { id: string }).id;
    const assignment = await admin.request.put(
      `${apiBaseUrl}/api/v1/tasks/${taskId}/assignees/${authorId}`,
      { headers: { "x-csrf-token": csrf } },
    );
    expect(assignment.ok()).toBe(true);
    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    const management = await browser.newContext({
      storageState: authStatePath("manager"),
      acceptDownloads: true,
    });
    const manager = await management.newPage();
    try {
      await signInThroughUi(employee, user);
      await employee.goto("/reports");
      await expect(
        employee.getByRole("heading", { name: "My reports" }),
      ).toBeVisible();
      await expect(employee.getByText("No reports to show")).toBeVisible();
      await expectNoWcag22AaViolations(employee, "empty employee reports");

      const cases = [
        {
          type: "DAILY" as const,
          label: "Daily",
          start: "2024-02-01",
          end: "2024-02-01",
          sections: {
            "Problems encountered": "E2E daily blocker",
            "Next day's plan": "E2E daily plan",
          },
        },
        {
          type: "WEEKLY" as const,
          label: "Weekly",
          start: "2024-02-05",
          end: "2024-02-11",
          sections: {
            "Department activities": "E2E weekly activities",
            "Major achievements": "E2E weekly result",
            Challenges: "E2E weekly challenge",
            "Next week's plan": "E2E weekly plan",
          },
        },
        {
          type: "MONTHLY" as const,
          label: "Monthly",
          start: "2024-02-01",
          end: "2024-02-29",
          sections: {
            "Department performance": "E2E monthly department",
            "Employee performance": "E2E monthly employee",
            "Major achievements": "E2E monthly result",
            Challenges: "E2E monthly challenge",
          },
        },
      ];
      const created: Report[] = [];
      for (const item of cases) {
        const title = `E2E ${item.label} ${user.lastName}`;
        await employee.getByRole("button", { name: "New report" }).click();
        const form = employee.getByRole("form", { name: "Report draft" });
        await expectNoWcag22AaViolations(
          employee,
          `${item.label} report draft`,
        );
        await form.getByLabel("Title").fill(title);
        await form.getByLabel("Report type").selectOption(item.type);
        await form.getByLabel("Period start (UTC)").fill(item.start);
        await form.getByLabel("Period end (UTC)").fill(item.end);
        for (const [label, value] of Object.entries(item.sections)) {
          await form.getByLabel(label).fill(value);
        }
        await form.getByRole("button", { name: "Save draft" }).click();
        await expect(form).toBeHidden();
        await expect(
          employee.getByRole("heading", { name: title }),
        ).toBeVisible();
        const report = await reportByTitle(employee, title, authorId);
        expect(report).toMatchObject({
          title,
          type: item.type,
          status: "DRAFT",
          authorId,
          periodStart: item.start,
          periodEnd: item.end,
        });
        created.push(report);
        await expect(
          employee.getByRole("heading", { name: title }),
        ).toBeVisible();
        for (const value of Object.values(item.sections)) {
          await expect(
            employee.getByText(value, { exact: true }),
          ).toBeVisible();
        }
        await employee.getByRole("button", { name: "Close detail" }).click();
      }

      const rows = await queryInSchema<{
        id: string;
        type: ReportType;
        status: ReportStatus;
        author_id: string;
      }>(
        databaseUrl(),
        `SELECT id, type, status, author_id FROM reports WHERE author_id = $1 ORDER BY type`,
        [authorId],
      );
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.type).sort()).toEqual([
        "DAILY",
        "MONTHLY",
        "WEEKLY",
      ]);
      expect(
        rows.every(
          (row) => row.status === "DRAFT" && row.author_id === authorId,
        ),
      ).toBe(true);

      const filters = employee.getByRole("region", { name: "Report filters" });
      await filters.getByLabel("Type").selectOption("MONTHLY");
      await filters.getByRole("button", { name: "Apply" }).click();
      await expect(
        employee.getByText("1 report", { exact: true }),
      ).toBeVisible();
      await expect(
        employee.getByRole("button", { name: created[2]!.title }).first(),
      ).toBeVisible();
      await expect(
        employee.getByRole("button", { name: created[0]!.title }),
      ).toHaveCount(0);
      await filters.getByRole("button", { name: "Clear" }).click();
      await expect(
        employee.getByText("3 reports", { exact: true }),
      ).toBeVisible();
      await filters.getByLabel("Period from (UTC)").fill("2024-01-01");
      await filters.getByLabel("Period to (UTC)").fill("2025-02-01");
      await expect(
        filters.getByText("Choose a range of at most 366 days."),
      ).toBeVisible();
      await expect(
        filters.getByRole("button", { name: "Apply" }),
      ).toBeDisabled();
      await filters.getByRole("button", { name: "Clear" }).click();

      await employee
        .getByRole("button", { name: created[0]!.title })
        .first()
        .click();
      const detailResponse = await employee.request.get(
        `${reportsUrl}/${created[0]!.id}`,
      );
      expect(detailResponse.ok()).toBe(true);
      const detail = (await detailResponse.json()) as Report;
      expect(detail.facts).toMatchObject({
        completedTasksInPeriod: 0,
        inProgressTasksNow: 0,
        pendingTasksNow: 1,
        overdueTasksNow: 1,
        totalProjectsNow: null,
      });
      const facts = employee.getByRole("region", { name: "Work facts" });
      for (const [label, value] of [
        ["Tasks completed in period", "0"],
        ["Tasks in progress now", "0"],
        ["Tasks pending now", "1"],
        ["Tasks overdue now", "1"],
      ] as const) {
        await expect(
          facts
            .locator("dl > div")
            .filter({ has: employee.getByText(label, { exact: true }) })
            .locator("dd"),
        ).toHaveText(value);
      }
      await expectNoWcag22AaViolations(employee, "employee report detail");
      await employee.getByRole("button", { name: "Submit for review" }).click();
      await expect
        .poll(async () => {
          const response = await employee.request.get(
            `${reportsUrl}/${created[0]!.id}`,
          );
          return ((await response.json()) as Report).status;
        })
        .toBe("SUBMITTED");

      await manager.goto("/reports");
      await expect(
        manager.getByRole("heading", { name: "Team reports" }),
      ).toBeVisible();
      await manager
        .getByRole("button", { name: created[0]!.title })
        .first()
        .click();
      await expectNoWcag22AaViolations(manager, "management report review");
      for (const viewport of [
        { width: 360, height: 800 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
        { width: 720, height: 900 },
      ]) {
        for (const [role, surface] of [
          ["employee", employee],
          ["manager", manager],
        ] as const) {
          await surface.setViewportSize(viewport);
          await surface.emulateMedia({ reducedMotion: "reduce" });
          expect(
            await surface.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await expectNoWcag22AaViolations(
            surface,
            `${role} reports ${viewport.width}`,
          );
          await surface.screenshot({
            path: testInfo.outputPath(`reports-${role}-${viewport.width}.png`),
            fullPage: true,
          });
        }
      }
      await manager.getByLabel("Review note (optional)").fill("E2E reviewed");
      await manager.getByLabel("Review note (optional)").press("Tab");
      await expect(
        manager.getByRole("button", { name: "Mark reviewed" }),
      ).toBeFocused();
      await manager
        .getByRole("button", { name: "Mark reviewed" })
        .press("Enter");
      await expect
        .poll(async () => {
          const response = await manager.request.get(
            `${reportsUrl}/${created[0]!.id}`,
          );
          return ((await response.json()) as Report).status;
        })
        .toBe("REVIEWED");
      const [review] = await queryInSchema<{ outcome: string; note: string }>(
        databaseUrl(),
        `SELECT outcome, note FROM report_reviews WHERE report_id = $1`,
        [created[0]!.id],
      );
      expect(review).toEqual({ outcome: "REVIEWED", note: "E2E reviewed" });

      const downloadEvent = manager.waitForEvent("download");
      await manager.getByRole("button", { name: "Export JSON" }).click();
      const download = await downloadEvent;
      const exported = JSON.parse(
        await readFile(await download.path(), "utf8"),
      ) as Report;
      expect(exported).toMatchObject({
        id: created[0]!.id,
        title: created[0]!.title,
        status: "REVIEWED",
        authorId,
      });
      await employee.reload();
      await employee
        .getByRole("button", { name: created[0]!.title })
        .first()
        .click();
      await expect(
        employee.getByText("E2E reviewed", { exact: true }),
      ).toBeVisible();
      await employee.setViewportSize({ width: 360, height: 800 });
      await employee.reload();
      await employee
        .getByRole("button", { name: created[0]!.title })
        .first()
        .click();
      await expect(
        employee.getByText("E2E reviewed", { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(employee, "employee report on mobile");
      expect(
        await employee.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      for (const report of created.slice(1)) {
        await employee
          .getByRole("button", { name: report.title })
          .first()
          .click();
        await employee
          .getByRole("button", { name: "Submit for review" })
          .click();
        await expect
          .poll(
            async () =>
              (
                (await (
                  await employee.request.get(`${reportsUrl}/${report.id}`)
                ).json()) as Report
              ).status,
          )
          .toBe("SUBMITTED");
        await manager.getByRole("button", { name: "Refresh reports" }).click();
        await manager
          .getByRole("button", { name: report.title })
          .first()
          .click();
        await expect(
          manager.getByRole("button", { name: "Mark reviewed" }),
        ).toBeVisible();
        await expectNoWcag22AaViolations(
          manager,
          `${report.type} management review`,
        );
        if (report.type === "WEEKLY") {
          await manager
            .getByLabel("Review note (optional)")
            .fill("Clarify weekly narrative");
          await manager
            .getByRole("button", { name: "Request changes" })
            .click();
          await expect
            .poll(
              async () =>
                (
                  (await (
                    await manager.request.get(`${reportsUrl}/${report.id}`)
                  ).json()) as Report
                ).status,
            )
            .toBe("CHANGES_REQUESTED");
          await employee
            .getByRole("button", { name: "Refresh reports" })
            .click();
          await employee.getByRole("button", { name: "Edit draft" }).click();
          const editForm = employee.getByRole("form", { name: "Report draft" });
          await expect(editForm.getByLabel("Challenges")).toHaveValue(
            "E2E weekly challenge",
          );
          await editForm
            .getByLabel("Challenges")
            .fill("E2E revised weekly challenge");
          await expectNoWcag22AaViolations(
            employee,
            "weekly changes-requested edit",
          );
          await employee.screenshot({
            path: testInfo.outputPath("reports-weekly-edit-360.png"),
            fullPage: true,
          });
          await editForm.getByRole("button", { name: "Save draft" }).click();
          await expect(editForm).toBeHidden();
          await employee
            .getByRole("button", { name: "Submit for review" })
            .click();
          await expect
            .poll(
              async () =>
                (
                  (await (
                    await employee.request.get(`${reportsUrl}/${report.id}`)
                  ).json()) as Report
                ).status,
            )
            .toBe("SUBMITTED");
          await manager
            .getByRole("button", { name: "Refresh reports" })
            .click();
          await expect(
            manager.getByRole("button", { name: "Mark reviewed" }),
          ).toBeVisible();
        }
        await manager.getByRole("button", { name: "Mark reviewed" }).click();
        await expect
          .poll(
            async () =>
              (
                (await (
                  await manager.request.get(`${reportsUrl}/${report.id}`)
                ).json()) as Report
              ).status,
          )
          .toBe("REVIEWED");
      }
    } finally {
      await management.close();
      await employeeContext.close();
    }
  });

  test("a self-scoped employee cannot list, read, or export another author's report", async ({
    page: admin,
    browser,
  }) => {
    const outsider = await createReportUser(admin);
    const author = await createReportUser(admin);
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const employeeContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    try {
      await signInThroughUi(authorPage, author.user);
      const title = `E2E private report ${randomUUID().slice(0, 8)}`;
      const response = await authorPage.request.post(reportsUrl, {
        headers: { "x-csrf-token": await csrfToken(authorPage) },
        data: {
          title,
          type: "DAILY",
          periodStart: "2023-01-01",
          periodEnd: "2023-01-01",
          problemsEncountered: "Private problem",
          nextDayPlan: "Private plan",
        },
      });
      expect(response.status()).toBe(201);
      const own = (await response.json()) as Report;
      await signInThroughUi(employee, outsider.user);
      await employee.goto("/reports");
      await expect(
        employee.getByRole("heading", { name: "My reports" }),
      ).toBeVisible();
      await expect(employee.getByText("No reports to show")).toBeVisible();
      await expect(employee.getByText(title)).toHaveCount(0);
      const listResponse = await employee.request.get(
        `${reportsUrl}?authorId=${own.authorId}`,
      );
      expect(listResponse.ok()).toBe(true);
      expect(((await listResponse.json()) as { total: number }).total).toBe(0);
      expect(
        (await employee.request.get(`${reportsUrl}/${own.id}`)).status(),
      ).toBe(403);
      expect(
        (await employee.request.get(`${reportsUrl}/${own.id}/export`)).status(),
      ).toBe(403);
    } finally {
      await employeeContext.close();
      await authorContext.close();
    }
  });

  test("workspace relations and the second page come from the authorized store", async ({
    page: admin,
    browser,
  }) => {
    test.setTimeout(90_000);
    const author = await createReportUser(admin, "Super Admin");
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInThroughUi(page, author.user);
      const csrf = await csrfToken(page);
      const eventResponse = await page.request.post(
        `${apiBaseUrl}/api/v1/events`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            name: `E2E report event ${randomUUID().slice(0, 8)}`,
            eventType: "CORPORATE_EVENT",
          },
        },
      );
      expect(eventResponse.status()).toBe(201);
      const workspaceId = (
        (await eventResponse.json()) as { workspaceId: string }
      ).workspaceId;
      // UUIDv7 prefixes are time-based, so another event can share the visible
      // short label. Exercise selection with more than one event workspace.
      const otherEvent = await page.request.post(
        `${apiBaseUrl}/api/v1/events`,
        {
          headers: { "x-csrf-token": csrf },
          data: {
            name: `E2E other report event ${randomUUID().slice(0, 8)}`,
            eventType: "CORPORATE_EVENT",
          },
        },
      );
      expect(otherEvent.status()).toBe(201);

      await page.goto("/reports");
      const workspaceFilter = page.getByLabel("Workspace", { exact: true });
      await expect(
        workspaceFilter.locator(`option[value="${workspaceId}"]`),
      ).toHaveCount(1);
      const workspaceLabel = `EVENT workspace ${workspaceId.slice(0, 8)}`;
      // The filter and draft use the same ordered workspace choices. Resolve
      // the full ID through the filter values rather than assuming short labels
      // are unique or selecting the first matching checkbox.
      const matchingIds = await workspaceFilter
        .locator("option")
        .evaluateAll(
          (options, label) =>
            options
              .filter((option) => option.textContent === label)
              .map((option) => (option as HTMLOptionElement).value),
          workspaceLabel,
        );
      const workspaceIndex = matchingIds.indexOf(workspaceId);
      expect(workspaceIndex).toBeGreaterThanOrEqual(0);
      await page.getByRole("button", { name: "New report" }).click();
      const form = page.getByRole("form", { name: "Report draft" });
      const title = `E2E linked report ${randomUUID().slice(0, 8)}`;
      await form.getByLabel("Title").fill(title);
      await form.getByLabel("Period start (UTC)").fill("2022-11-01");
      await form.getByLabel("Period end (UTC)").fill("2022-11-01");
      await form.getByLabel("Problems encountered").fill("Linked fixture");
      await form.getByLabel("Next day's plan").fill("Check relation");
      await form
        .getByLabel(workspaceLabel, { exact: true })
        .nth(workspaceIndex)
        .check();
      await form.getByRole("button", { name: "Save draft" }).click();
      await expect(form).toBeHidden();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      const linked = await reportByTitle(page, title, author.id);
      expect(linked.workspaceIds).toEqual([workspaceId]);
      const [relation] = await queryInSchema<{ workspace_id: string }>(
        databaseUrl(),
        `SELECT workspace_id FROM report_workspaces WHERE report_id = $1`,
        [linked.id],
      );
      expect(relation).toEqual({ workspace_id: workspaceId });

      for (let day = 1; day <= 11; day += 1) {
        const date = `2022-12-${String(day).padStart(2, "0")}`;
        const response = await page.request.post(reportsUrl, {
          headers: { "x-csrf-token": csrf },
          data: {
            title: `E2E page ${day}`,
            type: "DAILY",
            periodStart: date,
            periodEnd: date,
          },
        });
        expect(response.status()).toBe(201);
      }
      await page.getByRole("button", { name: "Refresh reports" }).click();
      const filters = page.getByRole("region", { name: "Report filters" });
      await filters.getByLabel("Type").selectOption("DAILY");
      await filters.getByLabel("Author").selectOption(author.id);
      await filters.getByLabel("Period from (UTC)").fill("2022-12-01");
      await filters.getByLabel("Period to (UTC)").fill("2022-12-11");
      await filters.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByText("11 reports", { exact: true })).toBeVisible();
      await expect(page.getByText("Page 1 of 2")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E page 1", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Reports pagination" })
        .getByRole("button", { name: "Next" })
        .click();
      await expect(page.getByText("Page 2 of 2")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E page 1", exact: true }).first(),
      ).toBeVisible();
      const secondPage = await page.request.get(
        `${reportsUrl}?authorId=${author.id}&type=DAILY&periodFrom=2022-12-01&periodTo=2022-12-11&page=2&pageSize=10`,
      );
      expect(secondPage.ok()).toBe(true);
      expect(((await secondPage.json()) as { items: Report[] }).items).toEqual([
        expect.objectContaining({ title: "E2E page 1" }),
      ]);
    } finally {
      await context.close();
    }
  });

  test("report reads are bounded and meet the authenticated API regression budget", async ({
    page,
  }) => {
    const url = `${reportsUrl}?page=1&pageSize=25`;
    expect((await page.request.get(url)).ok()).toBe(true);
    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const started = performance.now();
      expect((await page.request.get(url)).ok()).toBe(true);
      samples.push(performance.now() - started);
    }
    const sorted = samples.toSorted((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(
      p95,
      `Report list warm p95 ${p95.toFixed(1)} ms; samples ${samples.map((value) => value.toFixed(1)).join(", ")}`,
    ).toBeLessThanOrEqual(750);
    expect(
      (await page.request.get(`${reportsUrl}?pageSize=101`)).status(),
    ).toBe(400);
  });
});
