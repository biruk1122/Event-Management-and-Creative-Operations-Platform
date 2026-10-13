import { randomUUID } from "node:crypto";
import {
  expect,
  request,
  test,
  type Page,
  type Locator,
  type TestInfo,
} from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

async function headers(page: Page) {
  const csrf = (await page.context().cookies()).find(
    (c) => c.name === "csrf_token",
  )?.value;
  expect(csrf).toBeTruthy();
  return { "x-csrf-token": csrf! };
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  region?: Locator,
) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (region)
    expect(
      await region.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  await expectNoWcag22AaViolations(page, name);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

const viewports = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 720, height: 450 },
];

test.describe("Lela talent presentation", () => {
  test.use({ storageState: authStatePath("talentManager") });

  test("long profile, overlapping schedules and real duplicate-assignment feedback remain usable", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const auth = await headers(page);
    const name = `UI10-${randomUUID()}-${"LongTalentProfileName".repeat(4)}`;
    const created = await page.request.post(`${apiBaseUrl}/api/v1/talents`, {
      headers: auth,
      data: {
        fullName: name,
        type: "MUSICIAN",
        biography:
          "A creative professional with extensive live production experience. ".repeat(
            30,
          ),
      },
    });
    expect(created.status()).toBe(201);
    const talent = (await created.json()) as { id: string };
    for (const [title, startAt, endAt] of [
      [
        "Long sound check schedule",
        "2050-06-01T10:00:00.000Z",
        "2050-06-01T12:00:00.000Z",
      ],
      [
        "Overlapping rehearsal schedule",
        "2050-06-01T11:00:00.000Z",
        "2050-06-01T13:00:00.000Z",
      ],
    ]) {
      const schedule = await page.request.post(
        `${apiBaseUrl}/api/v1/talents/${talent.id}/schedules`,
        { headers: auth, data: { title, startAt, endAt } },
      );
      // Preserve current scheduling policy; no new capacity/overlap rule is invented.
      expect(schedule.status()).toBe(201);
    }
    const admin = await request.newContext({
      storageState: authStatePath("superAdmin"),
    });
    let event: { id: string; name: string };
    try {
      const csrf = (await admin.storageState()).cookies.find(
        (c) => c.name === "csrf_token",
      )?.value;
      const response = await admin.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": csrf! },
        data: { name: `UI10 Event ${randomUUID()}`, eventType: "CONCERT" },
      });
      expect(response.status()).toBe(201);
      event = (await response.json()) as { id: string; name: string };
    } finally {
      await admin.dispose();
    }
    const assigned = await page.request.post(
      `${apiBaseUrl}/api/v1/talents/${talent.id}/event-assignments`,
      { headers: auth, data: { eventId: event.id, role: "Headliner" } },
    );
    expect(assigned.status()).toBe(201);
    await page.goto("/talent");
    await page.getByLabel("Search", { exact: true }).fill(name);
    const opener = page.getByRole("button", { name: new RegExp(name) });
    await expect(opener).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark,
        );
        await capture(page, testInfo, `talent-list-${viewport.width}-${dark}`);
        await opener.focus();
        await page.keyboard.press("Enter");
        const detail = page.getByRole("dialog");
        await expect(
          detail.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
        await expect(
          detail.getByText("Overlapping rehearsal schedule", { exact: true }),
        ).toBeVisible();
        await capture(
          page,
          testInfo,
          `talent-detail-${viewport.width}-${dark}`,
          detail,
        );
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
      }
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await opener.click();
    const detail = page.getByRole("dialog");
    await detail
      .getByRole("button", { name: "Assign to an event", exact: true })
      .click();
    const form = detail.getByRole("form", {
      name: "Assign to an event",
      exact: true,
    });
    await form.getByLabel("Event", { exact: true }).click();
    await page.getByRole("option", { name: event.name, exact: true }).click();
    await form.getByLabel("Role", { exact: true }).fill("Repeat assignment");
    const conflict = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/talents/${talent.id}/event-assignments`) &&
        response.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Assign", exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      form.getByText("This talent is already assigned to that event."),
    ).toBeVisible();
    await expect(form.getByLabel("Role")).toHaveValue("Repeat assignment");
    await capture(page, testInfo, "talent-assignment-conflict-mobile", detail);
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    await detail
      .getByRole("button", { name: "Add schedule entry", exact: true })
      .click();
    const schedule = detail.getByRole("form", { name: "New schedule entry" });
    await schedule.getByLabel("Title").fill("Invalid date order");
    await schedule.getByLabel("Starts (UTC)").fill("2050-06-01T15:00");
    await schedule.getByLabel("Ends (UTC)").fill("2050-06-01T14:00");
    await schedule
      .getByRole("button", { name: "Add entry", exact: true })
      .click();
    await expect(
      schedule.getByText("The end must be after the start."),
    ).toBeVisible();
    await expect(schedule.getByLabel("Title")).toHaveValue(
      "Invalid date order",
    );
    await capture(page, testInfo, "talent-schedule-validation-mobile", detail);
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    const create = page.getByRole("button", {
      name: "New talent",
      exact: true,
    });
    await create.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog").getByLabel("Full name"),
    ).toBeVisible();
    await capture(
      page,
      testInfo,
      "talent-create-mobile",
      page.getByRole("dialog"),
    );
    await page.keyboard.press("Escape");
    await expect(create).toBeFocused();
  });
});

test.describe("Lela production presentation", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("long production resources, all shipped tabs, forms and empty filter recovery", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const name = `UI10-${randomUUID()}-${"LongProductionProjectName".repeat(4)}`;
    const response = await page.request.post(
      `${apiBaseUrl}/api/v1/productions`,
      {
        headers: await headers(page),
        data: {
          name,
          productionType: "Video Production",
          description: "Detailed production requirements. ".repeat(30),
          startAt: "2050-01-01T00:00:00.000Z",
          endAt: "2050-01-05T00:00:00.000Z",
          deadlineAt: "2050-01-10T00:00:00.000Z",
        },
      },
    );
    expect(response.status()).toBe(201);
    await page.goto("/projects/production");
    await page.getByLabel("Search productions").fill(name);
    const opener = page.getByRole("button", { name: new RegExp(name) });
    await expect(opener).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark,
        );
        await capture(
          page,
          testInfo,
          `production-list-${viewport.width}-${dark}`,
        );
        await opener.focus();
        await page.keyboard.press("Enter");
        const detail = page.getByRole("region", {
          name: "Production details",
          exact: true,
        });
        await expect(
          detail.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
        for (const tab of await detail.getByRole("tab").all()) {
          await tab.focus();
          await page.keyboard.press("Enter");
          await expect(tab).toHaveAttribute("aria-selected", "true");
        }
        await capture(
          page,
          testInfo,
          `production-detail-${viewport.width}-${dark}`,
          detail,
        );
        await detail
          .getByRole("button", { name: "Close details", exact: true })
          .click();
      }
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByLabel("Search productions").fill(`absent-${randomUUID()}`);
    await expect(
      page.getByText("No productions match these filters", { exact: true }),
    ).toBeVisible();
    await capture(page, testInfo, "production-empty-mobile");
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await expect(opener).toBeVisible();
    const create = page.getByRole("button", {
      name: "New production",
      exact: true,
    });
    await create.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Save production", exact: true })
      .click();
    await expect(dialog.getByText("Enter a name.")).toBeVisible();
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await capture(
      page,
      testInfo,
      "production-create-validation-mobile",
      dialog,
    );
    await page.keyboard.press("Escape");
    await expect(create).toBeFocused();
  });
});
