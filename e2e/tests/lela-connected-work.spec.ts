import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

test.describe("Lela connected work presentation", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  for (const profile of [
    {
      name: "baseline",
      down: 1_600_000,
      up: 750_000,
      latency: 300,
      lcp: 4000,
      interaction: 300,
    },
    {
      name: "constrained",
      down: 400_000,
      up: 250_000,
      latency: 600,
      lcp: 6000,
      interaction: 500,
    },
  ]) {
    test(`events cold mobile ${profile.name} and keyboard create`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(90_000);
      const context = await browser.newContext({
        storageState: authStatePath("superAdmin"),
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
      });
      try {
        const page = await context.newPage();
        await page.addInitScript(() => {
          const metrics = { lcp: 0, interactions: [] as number[] };
          Object.defineProperty(window, "workMetrics", { value: metrics });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              metrics.lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (
                (entry as PerformanceEntry & { interactionId: number })
                  .interactionId > 0
              )
                metrics.interactions.push(entry.duration);
          }).observe({
            type: "event",
            buffered: true,
            durationThreshold: 16,
          } as PerformanceObserverInit);
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: profile.latency,
          downloadThroughput: profile.down / 8,
          uploadThroughput: profile.up / 8,
        });
        await page.goto("/events");
        const opener = page.getByRole("button", {
          name: "New event",
          exact: true,
        });
        await expect(opener).toBeVisible();
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
        const metrics = await page.evaluate(
          () =>
            (
              window as unknown as {
                workMetrics: { lcp: number; interactions: number[] };
              }
            ).workMetrics,
        );
        const interactionBound = Math.max(16, ...metrics.interactions);
        await testInfo.attach("connected-work-mobile-profile", {
          body: JSON.stringify({
            profile,
            cache: "disabled",
            viewport: "360x800 DPR2",
            ...metrics,
            sampledInteractionUpperBound: interactionBound,
          }),
          contentType: "application/json",
        });
        expect(metrics.lcp).toBeGreaterThan(0);
        expect(metrics.lcp).toBeLessThanOrEqual(profile.lcp);
        expect(interactionBound).toBeLessThanOrEqual(profile.interaction);
      } finally {
        await context.close();
      }
    });
  }

  test("workspace lists, detail and task views retain responsive dark/light presentation", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const csrf = (await page.context().cookies()).find(
      (c) => c.name === "csrf_token",
    )?.value;
    expect(csrf).toBeTruthy();
    const headers = { "x-csrf-token": csrf! };
    const created = await page.request.post(`${apiBaseUrl}/api/v1/workspaces`, {
      headers,
      data: { kind: "EVENT" },
    });
    expect(created.status()).toBe(201);
    const workspace = (await created.json()) as { id: string };
    const title = `UI09-responsive-${randomUUID()}-${"UnbrokenTaskName".repeat(6)}`;
    const task = await page.request.post(`${apiBaseUrl}/api/v1/tasks`, {
      headers,
      data: {
        title,
        workspaceId: workspace.id,
        priority: "URGENT",
        dueAt: "2050-01-01T12:00:00.000Z",
      },
    });
    expect(task.status()).toBe(201);
    for (const route of ["/workspaces", "/tasks"]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: route === "/tasks" ? "Tasks" : "Workspaces",
        }),
      ).toBeVisible();
      if (route === "/tasks") await page.getByLabel("Search tasks").fill(title);
      for (const viewport of [
        { width: 360, height: 800 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
        { width: 720, height: 450 },
      ]) {
        await page.setViewportSize(viewport);
        for (const dark of [false, true]) {
          await page.evaluate(
            (value) => document.documentElement.classList.toggle("dark", value),
            dark,
          );
          const views =
            route === "/tasks" ? ["List", "Board", "Calendar"] : ["List"];
          for (const view of views) {
            if (route === "/tasks")
              await page
                .getByRole("group", { name: "Task view" })
                .getByRole("button", { name: view })
                .click();
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await expectNoWcag22AaViolations(
              page,
              `${route} ${view} ${viewport.width} ${dark}`,
            );
            await page.screenshot({
              path: testInfo.outputPath(
                `${route.slice(1)}-${view}-${viewport.width}-${dark}.png`,
              ),
              fullPage: true,
            });
          }
        }
      }
      await page.setViewportSize({ width: 360, height: 800 });
      const opener =
        route === "/tasks"
          ? page.getByRole("button", { name: title, exact: true })
          : page
              .getByRole("button", {
                name: "Event workspace, no manager",
                exact: true,
              })
              .first();
      await opener.focus();
      await page.keyboard.press("Enter");
      const detail = page.getByRole("dialog");
      await expect(detail).toBeVisible();
      await expectNoWcag22AaViolations(page, `${route} detail`);
      expect(
        await detail.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${route.slice(1)}-detail.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      if (route === "/workspaces") {
        const create = page.getByRole("button", {
          name: "New workspace",
          exact: true,
        });
        await create.focus();
        await page.keyboard.press("Enter");
        await expect(detail).toBeVisible();
        await expectNoWcag22AaViolations(page, "Workspace create");
        expect(
          await detail.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath("workspace-create.png"),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await expect(create).toBeFocused();
      }
    }
  });

  for (const area of [
    {
      endpoint: "events",
      title: "Events",
      action: "New event",
      data: { eventType: "CONCERT" },
    },
    {
      endpoint: "projects",
      title: "Projects",
      action: "New project",
      data: {},
    },
  ]) {
    test(`${area.title}: real connected task, responsive themes and forms`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const csrf = (await page.context().cookies()).find(
        (c) => c.name === "csrf_token",
      )?.value;
      expect(csrf).toBeTruthy();
      const headers = { "x-csrf-token": csrf! };
      const name = `UI09-${randomUUID()}-${"LongConnectedWorkName".repeat(4)}`;
      const created = await page.request.post(
        `${apiBaseUrl}/api/v1/${area.endpoint}`,
        { headers, data: { ...area.data, name } },
      );
      expect(created.status()).toBe(201);
      const record = (await created.json()) as {
        id: string;
        workspaceId: string;
      };
      const taskTitle = `Task-${name}`;
      const taskCreated = await page.request.post(
        `${apiBaseUrl}/api/v1/tasks`,
        {
          headers,
          data: {
            title: taskTitle,
            workspaceId: record.workspaceId,
            priority: "HIGH",
            dueAt: "2050-01-01T12:00:00.000Z",
          },
        },
      );
      expect(taskCreated.status()).toBe(201);
      const task = (await taskCreated.json()) as {
        id: string;
        workspaceId: string;
      };
      expect(task.workspaceId).toBe(record.workspaceId);

      await page.goto(`/${area.endpoint}`);
      await page.getByLabel("Search", { exact: true }).fill(name);
      const row = page.getByRole("button", { name: new RegExp(name) });
      await expect(row).toBeVisible();
      for (const viewport of [
        { width: 360, height: 800 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
        { width: 720, height: 450 },
      ]) {
        await page.setViewportSize(viewport);
        for (const dark of [false, true]) {
          await page.evaluate(
            (value) => document.documentElement.classList.toggle("dark", value),
            dark,
          );
          await expectNoWcag22AaViolations(
            page,
            `${area.title} ${viewport.width} ${dark}`,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(
              `${area.endpoint}-${viewport.width}-${dark}.png`,
            ),
            fullPage: true,
          });
        }
      }
      await page.setViewportSize({ width: 360, height: 800 });
      await row.focus();
      await page.keyboard.press("Enter");
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(
        page,
        `${area.title} detail mobile dark`,
      );
      if (area.endpoint === "events") {
        await detail.locator('input[type="file"]').setInputFiles({
          name: "unsupported.exe",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("not executable"),
        });
        await expect(detail.getByRole("alert")).toContainText(
          "File action needs attention",
        );
        await expect(
          detail.getByRole("button", { name: "Attach file", exact: true }),
        ).toBeDisabled();
        await expectNoWcag22AaViolations(
          page,
          "File selection error mobile dark",
        );
        const filename = `${"LongAuthorizedWorkspaceFile".repeat(5)}.txt`;
        await detail.locator('input[type="file"]').setInputFiles({
          name: filename,
          mimeType: "text/plain",
          buffer: Buffer.from("UI09 real private event file"),
        });
        await detail
          .getByRole("button", { name: "Attach file", exact: true })
          .click();
        await expect(detail.getByText(filename, { exact: true })).toBeVisible({
          timeout: 45_000,
        });
        await expect(
          detail.getByText(`${filename} is ready to download.`, {
            exact: true,
          }),
        ).toBeVisible();
        await expectNoWcag22AaViolations(
          page,
          "Available long filename mobile dark",
        );
        const download = page.waitForEvent("download");
        await detail
          .getByRole("button", { name: "Download", exact: true })
          .click();
        expect((await download).suggestedFilename()).toBe(filename);
      }
      expect(
        await detail.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${area.endpoint}-detail.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(row).toBeFocused();
      const create = page.getByRole("button", {
        name: area.action,
        exact: true,
      });
      await create.focus();
      await page.keyboard.press("Enter");
      await expect(detail).toBeVisible();
      for (let index = 0; index < 10; index++) {
        await page.keyboard.press("Tab");
        expect(
          await detail.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      await expectNoWcag22AaViolations(
        page,
        `${area.title} create mobile dark`,
      );
      expect(
        await detail.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(create).toBeFocused();

      // Existing routes, not invented workspace tabs: the API owns the connection.
      await page.goto("/tasks");
      await page.getByLabel("Search tasks").fill(taskTitle);
      for (const view of ["List", "Board", "Calendar"]) {
        await page
          .getByRole("group", { name: "Task view" })
          .getByRole("button", { name: view })
          .click();
        await expect(
          page.getByRole("button", { name: new RegExp(taskTitle) }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expectNoWcag22AaViolations(page, `Connected task ${view}`);
        await page.screenshot({
          path: testInfo.outputPath(`${area.endpoint}-task-${view}.png`),
          fullPage: true,
        });
      }
      const taskOpener = page.getByRole("button", {
        name: taskTitle,
        exact: true,
      });
      await taskOpener.focus();
      await page.keyboard.press("Enter");
      await expect(
        detail.getByRole("heading", { name: taskTitle, exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "Connected task detail");
      expect(
        await detail.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${area.endpoint}-task-detail.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(taskOpener).toBeFocused();
      await page
        .getByRole("group", { name: "Task view" })
        .getByRole("button", { name: "Board" })
        .click();
      await page
        .getByLabel("Search tasks")
        .fill(`no-matching-task-${randomUUID()}`);
      await expect(
        page.getByText("No tasks match these filters", { exact: true }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "Filtered empty task board");
      await page.screenshot({
        path: testInfo.outputPath(`${area.endpoint}-empty-board.png`),
        fullPage: true,
      });
      await page.getByLabel("Search tasks").fill(taskTitle);
      await expect(
        page.getByRole("button", { name: new RegExp(taskTitle) }),
      ).toBeVisible();
    });
  }
});
