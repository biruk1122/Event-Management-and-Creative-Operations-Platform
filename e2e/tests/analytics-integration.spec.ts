import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";

test.describe("analytics authoritative integration", () => {
  test.use({ storageState: authStatePath("superAdmin") });
  test("renders and refreshes real task counts, supports URL views and responsive tables", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const token = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )?.value;
    expect(token).toBeTruthy();
    const workspace = await page.request.post(
      `${apiBaseUrl}/api/v1/workspaces`,
      {
        headers: { "x-csrf-token": token! },
        data: { kind: "EVENT" },
      },
    );
    expect(workspace.status()).toBe(201);
    const { id: workspaceId } = (await workspace.json()) as { id: string };
    const createTask = async () => {
      const response = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
        headers: { "x-csrf-token": token! },
        data: { title: `Analytics verification ${randomUUID()}`, workspaceId },
      });
      expect(response.status()).toBe(201);
    };
    await createTask();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/analytics/task-completion") &&
        response.request().method() === "GET",
    );
    await page.goto("/analytics");
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const initial = (await response.json()) as { counts: { total: number } };
    const total = page
      .getByText("Eligible tasks", { exact: true })
      .locator("..")
      .locator("dd");
    await expect(total).toHaveText(String(initial.counts.total));
    await createTask();
    await page.getByRole("button", { name: "Refresh measure" }).click();
    await expect(total).toHaveText(String(initial.counts.total + 1));
    await expect(
      page.getByText("Task completion refreshed from authoritative data."),
    ).toBeVisible();
    await expectNoWcag22AaViolations(page, "live analytics task cohort");
    await page.getByLabel("Analytics measure").selectOption("monthly");
    await expect(page).toHaveURL(/measure=monthly/);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Tasks completed" }),
    ).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoWcag22AaViolations(
        page,
        `live analytics monthly ${width}px`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.reload();
    await expect(page.getByLabel("Analytics measure")).toHaveValue("monthly");
    await expect(page.getByRole("table")).toBeVisible();
  });
  test("requires a promotion subject and maps authoritative not-found without mock results", async ({
    page,
  }) => {
    await page.goto("/analytics?measure=promotion");
    await expect(
      page.getByRole("alert").filter({ hasText: "Enter a promotion" }),
    ).toContainText("Enter a promotion campaign ID.");
    await page
      .getByLabel("Promotion campaign ID (required)")
      .fill(randomUUID());
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "promotion campaign is unavailable" }),
    ).toContainText("promotion campaign is unavailable");
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test.describe("analytics employee access boundary", () => {
  test.use({ storageState: authStatePath("member") });
  test("hides navigation and denies deep links without requesting sensitive measures", async ({
    page,
  }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/analytics/")) requests++;
    });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Analytics", exact: true }),
    ).toHaveCount(0);
    await page.goto("/analytics?measure=employees");
    await expect(
      page.getByRole("alert").filter({ hasText: "Analytics access required" }),
    ).toContainText("do not have access");
    expect(requests).toBe(0);
  });
});
