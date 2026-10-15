import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

test.describe("optional Google Meet integration — disabled-safe boundary", () => {
  test.use({ storageState: authStatePath("superAdmin") });
  test("organizer edits a manual link while automation is off; another admin cannot manage it", async ({
    page,
    browser,
  }) => {
    const title = `Meet fallback ${randomUUID()}`;
    const csrf = (await page.context().cookies()).find(
      (cookie) => cookie.name === "csrf_token",
    )!.value;
    const created = await page.request.post(`${apiBaseUrl}/api/v1/meetings`, {
      headers: { "x-csrf-token": csrf },
      data: {
        title,
        type: "ONLINE",
        startAt: "2035-01-01T10:00:00Z",
        endAt: "2035-01-01T11:00:00Z",
        onlineLink: "https://video.example.test/manual",
        participantIds: [],
      },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await page.goto("/meetings");
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const integration = page.getByRole("region", {
      name: "Google Meet integration",
    });
    await expect(
      integration.getByText(/Automatic links are off/),
    ).toBeVisible();
    await expect(
      integration.getByRole("button", { name: "Connect Google Calendar" }),
    ).toHaveCount(0);
    const input = integration.getByLabel("Manual online meeting link");
    await input.fill("https://video.example.test/replacement");
    await integration.getByRole("button", { name: "Save manual link" }).click();
    await expect(integration.getByRole("status")).toContainText(
      "Manual link saved",
    );
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Join meeting", exact: true }),
    ).toHaveAttribute("href", "https://video.example.test/replacement");
    const disabled = await page.request.post(
      `${apiBaseUrl}/api/v1/meetings/${id}/google-meet`,
      { headers: { "x-csrf-token": csrf } },
    );
    expect(disabled.status()).toBe(409);
    expect(await disabled.json()).toMatchObject({
      code: "GOOGLE_MEET_DISABLED",
    });
    const noCsrf = await page.request.post(
      `${apiBaseUrl}/api/v1/meetings/${id}/google-meet`,
    );
    expect(noCsrf.status()).toBe(403);
    const other = await browser.newContext({
      storageState: authStatePath("manager"),
    });
    try {
      const token = (await other.cookies()).find(
        (cookie) => cookie.name === "csrf_token",
      )!.value;
      expect(
        (
          await other.request.get(
            `${apiBaseUrl}/api/v1/meetings/${id}/google-meet`,
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await other.request.post(
            `${apiBaseUrl}/api/v1/meetings/${id}/google-meet`,
            { headers: { "x-csrf-token": token } },
          )
        ).status(),
      ).toBe(403);
    } finally {
      await other.close();
    }
  });
});
