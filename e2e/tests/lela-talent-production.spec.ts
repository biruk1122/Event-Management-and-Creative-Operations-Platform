import { randomUUID } from "node:crypto";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

/** A valid 1x1 PNG, used as the profile photo. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A talent with an overlapping schedule and a Production-department event. */
const SCHEDULE = {
  startAt: "2050-06-01T10:00:00.000Z",
  endAt: "2050-06-01T12:00:00.000Z",
};
const EVENT_WINDOW = {
  startAt: "2050-06-01T11:00:00.000Z",
  endAt: "2050-06-01T13:00:00.000Z",
};

/** An API client signed in as one of the e2e accounts, carrying its CSRF token. */
async function apiAs(key: string): Promise<APIRequestContext> {
  return request.newContext({ storageState: authStatePath(key) });
}

async function csrfHeader(
  api: APIRequestContext,
): Promise<Record<string, string>> {
  const token = (await api.storageState()).cookies.find(
    (c) => c.name === "csrf_token",
  )?.value;
  expect(token).toBeTruthy();
  return { "x-csrf-token": token! };
}

async function createTalent(
  api: APIRequestContext,
  fullName: string,
  email: string,
): Promise<{ id: string; fullName: string }> {
  const response = await api.post(`${apiBaseUrl}/api/v1/talents`, {
    headers: await csrfHeader(api),
    data: { fullName, type: "MUSICIAN", email, phone: "+251 911 000 000" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; fullName: string };
}

async function createEvent(
  api: APIRequestContext,
  name: string,
  window?: { startAt: string; endAt: string },
): Promise<{ id: string; name: string }> {
  const response = await api.post(`${apiBaseUrl}/api/v1/events`, {
    headers: await csrfHeader(api),
    data: { name, eventType: "CONCERT", ...(window ?? {}) },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function openProfile(page: Page, name: string): Promise<void> {
  await page.goto("/talent");
  await page.getByLabel("Search", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: `View profile of ${name}`, exact: true })
    .first()
    .click();
  await page.waitForURL(/\/talent\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { level: 2, name, exact: true }),
  ).toBeVisible();
}

test.describe("Production Manager talent journeys", () => {
  test.use({ storageState: authStatePath("productionManager") });

  test("sees masked contact details, assigns only own-department work, and cancels with a reason", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const id = randomUUID().slice(0, 8);
    const name = `Scoped Talent ${id}`;
    const email = `scoped-${id}@e2e.test`;
    const superAdmin = await apiAs("superAdmin");
    const production = await apiAs("productionManager");
    const talent = await createTalent(superAdmin, name, email);
    const ownEvent = await createEvent(
      production,
      `PM Event ${id}`,
      EVENT_WINDOW,
    );
    const otherEvent = await createEvent(
      superAdmin,
      `Organization Event ${id}`,
      EVENT_WINDOW,
    );

    await page.setViewportSize({ width: 360, height: 800 });
    await openProfile(page, name);

    // Contact details are masked for the Production Manager, and the profile is read-only.
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/read-only access/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expectNoWcag22AaViolations(page, "production manager talent profile");

    // Work options are limited to the Production department.
    await page
      .getByRole("button", { name: "Assign to work", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Assign talent", exact: true });
    await form.getByRole("combobox", { name: "Work", exact: true }).click();
    await expect(
      page.getByRole("option", { name: ownEvent.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: otherEvent.name, exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The API refuses the same work outside the scope, whatever the screen offers.
    const refused = await production.post(
      `${apiBaseUrl}/api/v1/talents/${talent.id}/assignments`,
      {
        headers: await csrfHeader(production),
        data: {
          kind: "EVENT",
          workId: otherEvent.id,
          role: "Host",
          ...EVENT_WINDOW,
        },
      },
    );
    expect([403, 404]).toContain(refused.status());

    // Assign own-department work.
    await page
      .getByRole("button", { name: "Assign to work", exact: true })
      .click();
    await form.getByRole("combobox", { name: "Work", exact: true }).click();
    await page
      .getByRole("option", { name: ownEvent.name, exact: true })
      .click();
    await form.getByLabel("Role", { exact: true }).fill("Host");
    await expect(
      form.getByRole("button", { name: "Confirm assignment", exact: true }),
    ).toBeEnabled();
    await form
      .getByRole("button", { name: "Confirm assignment", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText(ownEvent.name, { exact: true })).toBeVisible();

    // Cancelling needs a reason; with one, the row records it.
    await page
      .getByRole("button", { name: "Cancel assignment", exact: true })
      .click();
    const cancel = page.getByRole("dialog");
    await cancel
      .getByRole("button", { name: "Cancel assignment", exact: true })
      .click();
    await expect(
      cancel.getByText("Say why the assignment is being cancelled."),
    ).toBeVisible();
    await cancel.getByLabel("Reason", { exact: true }).fill("Talent withdrew");
    await cancel
      .getByRole("button", { name: "Cancel assignment", exact: true })
      .click();
    await expect(page.getByText("Cancelled: Talent withdrew")).toBeVisible();
    await expect(
      page.getByText("Cancelled", { exact: true }).first(),
    ).toBeVisible();

    // The history records the cancellation with its actor.
    const history = page
      .getByRole("heading", { name: "History", exact: true })
      .locator("..");
    await expect(
      history.getByText("Assignment cancelled", { exact: true }),
    ).toBeVisible();
  });

  test("a conflicting window needs an explicit acknowledgement before it is saved", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const id = randomUUID().slice(0, 8);
    const name = `Conflict Talent ${id}`;
    const superAdmin = await apiAs("superAdmin");
    const production = await apiAs("productionManager");
    const talent = await createTalent(
      superAdmin,
      name,
      `conflict-${id}@e2e.test`,
    );
    const schedule = await superAdmin.post(
      `${apiBaseUrl}/api/v1/talents/${talent.id}/schedules`,
      {
        headers: await csrfHeader(superAdmin),
        data: { title: "Sound check", ...SCHEDULE },
      },
    );
    expect(schedule.status()).toBe(201);
    const event = await createEvent(
      production,
      `Conflict Event ${id}`,
      EVENT_WINDOW,
    );

    await openProfile(page, name);
    await page
      .getByRole("button", { name: "Assign to work", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Assign talent", exact: true });
    await form.getByRole("combobox", { name: "Work", exact: true }).click();
    await page.getByRole("option", { name: event.name, exact: true }).click();
    await form.getByLabel("Role", { exact: true }).fill("Headliner");

    await expect(
      form.getByText("Overlaps the schedule Sound check."),
    ).toBeVisible();
    const confirm = form.getByRole("button", {
      name: "Confirm assignment",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await form
      .getByRole("checkbox", {
        name: "Assign anyway, knowing about these conflicts",
      })
      .click();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(form).toHaveCount(0);
    await expect(page.getByText(event.name, { exact: true })).toBeVisible();
    await expectNoWcag22AaViolations(page, "talent conflict acknowledgement");
  });
});

test.describe("Admin talent access", () => {
  test.use({ storageState: authStatePath("admin") });

  test("sees contact details, sees the New talent action, and archives talent with no active work", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const id = randomUUID().slice(0, 8);
    const name = `Admin Talent ${id}`;
    const email = `admin-${id}@e2e.test`;
    const superAdmin = await apiAs("superAdmin");
    await createTalent(superAdmin, name, email);

    await page.goto("/talent");
    await expect(
      page.getByRole("button", { name: "New talent", exact: true }),
    ).toBeVisible();
    await openProfile(page, name);
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: "Archive talent", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Archive talent", exact: true })
      .click();
    await expect(
      page.getByText("Inactive", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Talent archived.", { exact: true }),
    ).toHaveCount(1);
  });
});

test.describe("Talent profile photo", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("uploads a profile photo and shows it on the profile", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const id = randomUUID().slice(0, 8);
    const name = `Photo Talent ${id}`;
    const superAdmin = await apiAs("superAdmin");
    await createTalent(superAdmin, name, `photo-${id}@e2e.test`);

    await openProfile(page, name);
    await page
      .getByLabel("Choose a profile photo", { exact: true })
      .setInputFiles({
        name: "portrait.png",
        mimeType: "image/png",
        buffer: PNG,
      });

    const photo = page.locator('img[src*="/profile-image/content"]');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("src", /\/profile-image\/content\?v=/);
  });
});
