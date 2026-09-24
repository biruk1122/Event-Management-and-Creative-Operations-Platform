import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";

async function csrfToken(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "csrf_token",
  )?.value;
  expect(token).toBeTruthy();
  return token!;
}

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("global setup should export DATABASE_URL");
  return url;
}

interface ApiProduction {
  id: string;
  workspaceId: string;
  name: string;
  productionType: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  status: string;
  manager: { id: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string }[];
}

test.describe("Production management — end to end", () => {
  test.describe("administrator journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("persists details, assignments and lifecycle through reload, with conflict and responsive checks", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const suffix = randomUUID().slice(0, 8);
      const name = `E2E Production ${suffix}`;
      const teamName = `E2E Production Team ${suffix}`;
      const csrf = await csrfToken(page);

      // The team picker reads real teams; prepare its owning department and team.
      const department = await page.request.post(
        `${apiBaseUrl}/api/v1/departments`,
        {
          headers: { "x-csrf-token": csrf },
          data: { name: `E2E Production Dept ${suffix}` },
        },
      );
      expect(department.status()).toBe(201);
      const team = await page.request.post(`${apiBaseUrl}/api/v1/teams`, {
        headers: { "x-csrf-token": csrf },
        data: {
          name: teamName,
          departmentId: ((await department.json()) as { id: string }).id,
        },
      });
      expect(team.status()).toBe(201);
      const teamId = ((await team.json()) as { id: string }).id;

      const users = await page.request.get(
        `${apiBaseUrl}/api/v1/users?search=member%40e2e.test`,
      );
      expect(users.ok()).toBe(true);
      const memberId = (
        (await users.json()) as { items: { id: string; email: string }[] }
      ).items.find((user) => user.email === "member@e2e.test")?.id;
      expect(memberId).toBeTruthy();

      await page.goto("/projects/production");
      await expect(
        page.getByRole("heading", { name: "Production projects" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "production list");
      await page.getByRole("button", { name: "New production" }).click();
      const create = page.getByRole("dialog");
      await create.getByLabel("Name").fill(name);
      await create.getByLabel("Production type").fill("Video Production");
      await create.getByLabel("Start date").fill("2026-10-01");
      await create.getByLabel("End date").fill("2026-09-30");
      await create.getByRole("button", { name: "Save production" }).click();
      await expect(create.getByText("End must follow start.")).toBeVisible();
      await expect(create.getByLabel("Name")).toHaveValue(name);
      await create.getByLabel("End date").fill("2026-10-05");
      await create.getByLabel("Deadline").fill("2026-10-10");
      await expectNoWcag22AaViolations(page, "production create dialog");
      await create.getByRole("button", { name: "Save production" }).click();
      await expect(create).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: new RegExp(name) }),
      ).toBeVisible();

      const list = await page.request.get(
        `${apiBaseUrl}/api/v1/productions?search=${encodeURIComponent(name)}`,
      );
      expect(list.ok()).toBe(true);
      const production = ((await list.json()) as { items: ApiProduction[] })
        .items[0];
      if (!production) throw new Error("Created production was not listed");
      expect(production).toMatchObject({
        name,
        productionType: "Video Production",
        status: "PLANNED",
      });
      expect(production.startAt).toContain("2026-10-01");
      expect(production.endAt).toContain("2026-10-05");
      expect(production.deadlineAt).toContain("2026-10-10");
      const rows = await queryInSchema<{
        workspace_id: string;
        status: string;
      }>(
        runDatabaseUrl(),
        "SELECT workspace_id, status FROM productions WHERE id = $1",
        [production.id],
      );
      expect(rows).toEqual([
        { workspace_id: production.workspaceId, status: "PLANNED" },
      ]);

      await page.getByRole("button", { name: new RegExp(name) }).click();
      const detail = page.getByRole("region", { name: "Production details" });
      await expect(detail).toBeVisible();
      await detail.getByLabel("Assign manager").selectOption(memberId!);
      await expect(detail.getByLabel("Assign manager")).toHaveValue(memberId!);
      await detail.getByLabel("Add member").selectOption(memberId!);
      await expect(
        detail.getByRole("button", { name: "Remove member@e2e.test" }),
      ).toBeVisible();
      await detail.getByLabel("Assign team").selectOption(teamId);
      await expect(
        detail.getByRole("button", { name: `Unassign ${teamName}` }),
      ).toBeVisible();

      const workspace = detail.getByRole("region", {
        name: "Connected workspace",
      });
      await workspace.getByRole("tab", { name: "Team" }).click();
      await expect(workspace.getByRole("tabpanel")).toContainText(
        "1 assigned team; 1 member",
      );
      await workspace.getByRole("tab", { name: "Tasks" }).click();
      await expect(
        workspace.getByRole("link", { name: "Open Tasks" }),
      ).toHaveAttribute("href", "/tasks");
      await expectNoWcag22AaViolations(page, "production detail");

      await detail.getByLabel("Move to").selectOption("ACTIVE");
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/productions/${production.id}`,
          );
          return ((await response.json()) as ApiProduction).status;
        })
        .toBe("ACTIVE");
      await detail.getByRole("button", { name: "Edit details" }).click();
      const edit = page.getByRole("dialog");
      await edit.getByLabel("Description").fill("Studio shoot ready");
      await edit.getByRole("button", { name: "Save production" }).click();
      await expect(detail.getByText("Studio shoot ready")).toBeVisible();
      await detail.getByLabel("Move to").selectOption("COMPLETED");
      await expect
        .poll(async () => {
          const response = await page.request.get(
            `${apiBaseUrl}/api/v1/productions/${production.id}`,
          );
          return ((await response.json()) as ApiProduction).status;
        })
        .toBe("COMPLETED");

      // Reopening after a browser reload must use the persisted API state.
      await page.reload();
      await page.getByRole("button", { name: new RegExp(name) }).click();
      const reopened = page.getByRole("region", { name: "Production details" });
      await expect(reopened.getByText("Studio shoot ready")).toBeVisible();
      await expect(
        reopened.getByRole("button", { name: `Unassign ${teamName}` }),
      ).toBeVisible();
      await expect(reopened.getByLabel("Assign manager")).toHaveValue(
        memberId!,
      );
      const persisted = await page.request.get(
        `${apiBaseUrl}/api/v1/productions/${production.id}`,
      );
      expect(await persisted.json()).toMatchObject({
        status: "COMPLETED",
        description: "Studio shoot ready",
        manager: { id: memberId },
        teams: [{ id: teamId }],
        participants: [{ id: memberId }],
      });
      expect(
        await queryInSchema(
          runDatabaseUrl(),
          "SELECT status FROM productions WHERE id = $1 AND workspace_id = $2",
          [production.id, production.workspaceId],
        ),
      ).toEqual([{ status: "COMPLETED" }]);

      const invalid = await page.request.post(
        `${apiBaseUrl}/api/v1/productions/${production.id}/transition`,
        { headers: { "x-csrf-token": csrf }, data: { status: "ACTIVE" } },
      );
      expect(invalid.status()).toBe(409);
      expect(await invalid.json()).toMatchObject({
        code: "PRODUCTION_TRANSITION_INVALID",
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Production projects" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: new RegExp(name) }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "production mobile list");
    });
  });

  test.describe("denied journey", () => {
    test.use({ storageState: authStatePath("deptManager") });

    test("rejects department-scoped production access and writes nothing", async ({
      page,
    }) => {
      await page.goto("/projects/production");
      await expect(
        page.getByText("You do not have access to this area."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New production" }),
      ).toHaveCount(0);
      const list = await page.request.get(`${apiBaseUrl}/api/v1/productions`);
      expect(list.status()).toBe(403);
      const name = `E2E Denied Production ${randomUUID().slice(0, 8)}`;
      const create = await page.request.post(
        `${apiBaseUrl}/api/v1/productions`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { name, productionType: "Video Production" },
        },
      );
      expect(create.status()).toBe(403);
      expect(await create.json()).toMatchObject({ code: "PERMISSION_DENIED" });
      expect(
        await queryInSchema(
          runDatabaseUrl(),
          "SELECT id FROM productions WHERE name = $1",
          [name],
        ),
      ).toHaveLength(0);
    });
  });
});
