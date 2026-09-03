import { expect, test } from "@playwright/test";

import { countAppliedMigrations } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";

test.describe("foundation smoke journey", () => {
  test("the web application renders the foundation surface", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "A dependable surface for the work that comes next.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No business features are implemented in this phase."),
    ).toBeVisible();
  });

  test("the web server reaches the API through its health bridge", async ({
    request,
  }) => {
    const response = await request.get("/api/health/backend");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      status: "ready",
      checks: { api: "up" },
      backend: { status: "ok" },
    });
  });

  test("the API reports PostgreSQL readiness", async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health/ready`);

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      status: "ready",
      checks: { database: "up" },
    });
  });

  test("the run operates inside an isolated, migrated schema", async () => {
    const databaseUrl = process.env.DATABASE_URL;

    expect(
      databaseUrl,
      "global setup should export the per-run DATABASE_URL",
    ).toBeTruthy();
    expect(databaseUrl).toContain("schema=e2e_");

    await expect(
      countAppliedMigrations(databaseUrl as string),
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
