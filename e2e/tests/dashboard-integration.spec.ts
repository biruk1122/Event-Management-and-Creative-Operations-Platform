import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { components } from "../../packages/api-client/src/index.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { TEST_USERS } from "../fixtures/test-users.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";

test.describe("dashboard authoritative integration", () => {
  test.use({ storageState: authStatePath("superAdmin") });
  test("renders real management aggregates, refreshes after writes and applies bounded ranges", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signInThroughUi(
      page,
      TEST_USERS.find((user) => user.key === "superAdmin")!,
    );
    const token = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )!.value;
    const workspace = await page.request.post(
      `${apiBaseUrl}/api/v1/workspaces`,
      { headers: { "x-csrf-token": token }, data: { kind: "EVENT" } },
    );
    expect(workspace.status()).toBe(201);
    const { id: workspaceId } = (await workspace.json()) as { id: string };
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/dashboards/management") &&
        response.request().method() === "GET",
    );
    await page.goto("/dashboard");
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const initial =
      (await response.json()) as components["schemas"]["DashboardResponse"];
    const card = page.getByRole("article", {
      name: "Pending tasks",
      exact: true,
    });
    const count = (
      initial.cards.pendingTasks!
        .data as components["schemas"]["DashboardCount"]
    ).count;
    await expect(card.getByText(String(count), { exact: true })).toBeVisible();
    const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
      headers: { "x-csrf-token": token },
      data: { title: `Dashboard smoke ${randomUUID()}`, workspaceId },
    });
    expect(task.status()).toBe(201);
    await page
      .getByRole("button", { name: "Refresh dashboard", exact: true })
      .click();
    await expect(
      card.getByText(String(count + 1), { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Items per list (1–10)").fill("10");
    await page.getByLabel("Cohort start (UTC)").fill("2026-09-01");
    await page.getByLabel("Cohort end (excluded, UTC)").fill("2026-10-01");
    await page.getByLabel("Monthly buckets (1–12)").fill("6");
    const filtered = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/dashboards/management") &&
        response.url().includes("limit=10"),
    );
    await page.getByRole("button", { name: "Apply filters" }).click();
    expect((await filtered).ok()).toBe(true);
    await expect(page).toHaveURL(/from=2026-09-01/);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoWcag22AaViolations(
        page,
        `live management dashboard ${width}`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.reload();
    await expect(page.getByLabel("Monthly buckets (1–12)")).toHaveValue("6");
  });
});
test.describe("dashboard employee integration", () => {
  test.use({ storageState: authStatePath("member") });
  test("shows caller-owned To-Do and blocks management deep links without a management fetch", async ({
    page,
  }) => {
    await signInThroughUi(
      page,
      TEST_USERS.find((user) => user.key === "member")!,
    );
    const token = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )!.value;
    const title = `My dashboard To-Do ${randomUUID()}`;
    const created = await page.request.post(`${apiBaseUrl}/api/v1/todos`, {
      headers: { "x-csrf-token": token },
      data: { title },
    });
    expect(created.status()).toBe(201);
    await page.goto("/dashboard");
    await expect(
      page
        .getByRole("article", { name: "My To-Do", exact: true })
        .getByText(title),
    ).toBeVisible();
    await expect(page.getByLabel("Dashboard view")).toHaveValue("employee");
    await expectNoWcag22AaViolations(page, "live employee dashboard");
    let managementRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/dashboards/management"))
        managementRequests++;
    });
    await page.goto("/dashboard?audience=management");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "do not have access to the requested dashboard view",
    );
    expect(managementRequests).toBe(0);
  });
});
