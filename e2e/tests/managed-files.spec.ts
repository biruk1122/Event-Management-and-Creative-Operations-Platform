import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureName } from "../fixtures/test-data.js";

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("The E2E harness should provide DATABASE_URL.");
  return url;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

async function csrfTokenForStorageState(storageState: string): Promise<string> {
  const context = await request.newContext({ storageState });
  try {
    const token = (await context.storageState()).cookies.find(
      (cookie) => cookie.name === "csrf_token",
    )?.value;
    expect(token, "seeded admin csrf_token should be present").toBeTruthy();
    return token as string;
  } finally {
    await context.dispose();
  }
}

interface ApiEvent {
  id: string;
  workspaceId: string;
}

test.describe("Secure event-file management — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("uploads, verifies, downloads, and reloads an event file from authoritative services", async ({
      page,
    }) => {
      const eventName = `E2E File Event ${fixtureName("file")}-${randomUUID().slice(0, 8)}`;
      const filename = "e2e-call-sheet.txt";
      const bytes = Buffer.from("E2E call sheet\n", "utf8");
      const create = await page.request.post(`${apiBaseUrl}/api/v1/events`, {
        headers: { "x-csrf-token": await csrfToken(page) },
        data: { name: eventName, eventType: "CORPORATE_EVENT" },
      });
      expect(create.status()).toBe(201);
      const event = (await create.json()) as ApiEvent;

      await page.goto("/events");
      await page.getByRole("button", { name: eventName }).first().click();
      const detail = page.getByRole("dialog");
      await expect(
        detail.getByRole("heading", { name: eventName }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "event file dialog");

      const fileInput = detail.locator('input[type="file"]');
      const chooserPromise = page.waitForEvent("filechooser");
      await fileInput.click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: filename,
        mimeType: "text/plain",
        buffer: bytes,
      });
      const attachButton = detail.getByRole("button", { name: "Attach file" });
      await expect(attachButton).toBeEnabled();
      const uploadResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).port === "9000",
      );
      await attachButton.click();
      expect((await uploadResponse).ok()).toBe(true);
      await expect(detail.getByText(filename, { exact: true })).toBeVisible();
      await expect(
        detail.getByText("e2e-call-sheet.txt is ready to download."),
      ).toBeVisible();

      const listed = await page.request.get(
        `${apiBaseUrl}/api/v1/events/${event.id}/files`,
      );
      expect(listed.ok()).toBe(true);
      const files = (await listed.json()) as {
        items: Array<{ id: string; filename: string; state: string }>;
        total: number;
      };
      expect(files).toMatchObject({
        total: 1,
        items: [{ filename, state: "available" }],
      });
      const fileId = files.items[0]?.id;
      expect(fileId).toBeTruthy();

      const persisted = await queryInSchema<{
        state: string;
        verified_media_type: string | null;
        verified_size_bytes: number | null;
      }>(
        runDatabaseUrl(),
        `SELECT state, verified_media_type, verified_size_bytes
           FROM managed_files
          WHERE id = $1`,
        [fileId],
      );
      expect(persisted).toEqual([
        {
          state: "AVAILABLE",
          verified_media_type: "text/plain",
          verified_size_bytes: bytes.byteLength,
        },
      ]);
      const attachments = await queryInSchema<{ managed_file_id: string }>(
        runDatabaseUrl(),
        `SELECT managed_file_id
           FROM workspace_file_attachments
          WHERE workspace_id = $1 AND managed_file_id = $2`,
        [event.workspaceId, fileId],
      );
      expect(attachments).toEqual([{ managed_file_id: fileId }]);

      const download = page.waitForEvent("download");
      await detail.getByRole("button", { name: "Download" }).click();
      const saved = await download;
      expect(saved.suggestedFilename()).toBe(filename);
      const downloadPath = await saved.path();
      expect(downloadPath).toBeTruthy();
      expect(await readFile(downloadPath as string)).toEqual(bytes);

      // The browser reload proves the UI rehydrates from the API rather than
      // keeping the just-uploaded item only in client state.
      await page.reload();
      await page.getByRole("button", { name: eventName }).first().click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByText(filename, { exact: true })).toBeVisible();
    });
  });

  test.describe("denied journey", () => {
    // Existing event E2E coverage proves this role is authenticated while its
    // department-scoped grant cannot read organization-scoped events.
    test.use({ storageState: authStatePath("deptManager") });

    test("a department-scoped user cannot discover or create attachments for an event", async ({
      page,
    }) => {
      const owner = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const eventName = `E2E File Denied ${randomUUID().slice(0, 8)}`;
      let eventId: string | undefined;
      try {
        const create = await owner.post(`${apiBaseUrl}/api/v1/events`, {
          headers: {
            "x-csrf-token": await csrfTokenForStorageState(
              authStatePath("superAdmin"),
            ),
          },
          data: { name: eventName, eventType: "CORPORATE_EVENT" },
        });
        expect(create.status()).toBe(201);
        eventId = ((await create.json()) as ApiEvent).id;

        await page.goto("/events");
        await expect(
          page.getByText("You do not have access to this area."),
        ).toBeVisible();

        const list = await page.request.get(
          `${apiBaseUrl}/api/v1/events/${eventId}/files`,
        );
        expect(list.status()).toBe(403);

        const deniedFilename = "not-authorized.pdf";
        const createIntent = await page.request.post(
          `${apiBaseUrl}/api/v1/events/${eventId}/files/upload-intents`,
          {
            headers: { "x-csrf-token": await csrfToken(page) },
            data: {
              filename: deniedFilename,
              mediaType: "application/pdf",
              sizeBytes: 32,
            },
          },
        );
        expect(createIntent.status()).toBe(403);
        expect((await createIntent.json()) as { code: string }).toMatchObject({
          code: "PERMISSION_DENIED",
        });
        const leaked = await queryInSchema(
          runDatabaseUrl(),
          `SELECT id FROM managed_files WHERE original_filename = $1`,
          [deniedFilename],
        );
        expect(leaked).toHaveLength(0);
      } finally {
        if (eventId) {
          const cleanup = await owner.delete(
            `${apiBaseUrl}/api/v1/events/${eventId}`,
            {
              headers: {
                "x-csrf-token": await csrfTokenForStorageState(
                  authStatePath("superAdmin"),
                ),
              },
            },
          );
          expect(cleanup.status()).toBe(204);
        }
        await owner.dispose();
      }
    });
  });
});
