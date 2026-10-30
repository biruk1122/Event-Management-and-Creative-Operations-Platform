import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";

test.use({ storageState: authStatePath("superAdmin") });
for (const kind of ["DIRECT", "CHANNEL"] as const) {
  test(`${kind}: keyboard, emojis, private files, image previews and persisted receipts`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.goto("/discuss/dm");
    const csrf = (await page.context().cookies()).find(
      (c) => c.name === "csrf_token",
    )!.value;
    const users = await page.request.get(
      `${apiBaseUrl}/api/v1/users?search=manager%40e2e.test`,
    );
    const peer = (await users.json()).items.find(
      (u: { email: string }) => u.email === "manager@e2e.test",
    );
    expect(peer).toBeTruthy();
    const created = await page.request.post(
      `${apiBaseUrl}/api/v1/conversations${kind === "CHANNEL" ? "/channels" : ""}`,
      {
        headers: { "x-csrf-token": csrf },
        data:
          kind === "CHANNEL"
            ? { name: `Chat design ${Date.now()}`, visibility: "PRIVATE" }
            : { type: "DIRECT", memberIds: [peer.id] },
      },
    );
    expect(created.status()).toBe(201);
    const conversation = await created.json();
    if (kind === "CHANNEL")
      expect(
        (
          await page.request.put(
            `${apiBaseUrl}/api/v1/conversations/${conversation.id}/members/${peer.id}`,
            { headers: { "x-csrf-token": csrf } },
          )
        ).ok(),
      ).toBe(true);
    const route = `/discuss/${kind === "DIRECT" ? "dm" : "channels"}/${conversation.id}`;
    await page.goto(route);
    const thread = page.getByRole("list", { name: "Messages", exact: true });
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(input).toBeVisible();
    await input.fill("Hello");
    await input.press("Shift+Enter");
    await input.pressSequentially("Team");
    await expect(input).toHaveValue("Hello\nTeam");
    await page.getByRole("button", { name: "Choose emoji" }).click();
    await page.getByRole("textbox", { name: "Search emojis" }).fill("wave");
    await page.getByRole("button", { name: "hello wave" }).click();
    await expect(input).toHaveValue("Hello\nTeam👋");
    await input.press("Enter");
    await expect(thread.getByText("Hello\nTeam👋")).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(thread.getByLabel("Sent", { exact: true })).toBeVisible();

    const recipient = await browser.newContext({
      storageState: authStatePath("manager"),
    });
    const outsider = await browser.newContext({
      storageState: authStatePath("member"),
    });
    try {
      const peerPage = await recipient.newPage();
      await peerPage.goto(new URL(route, page.url()).href);
      await peerPage.bringToFront();
      await expect(
        peerPage
          .getByRole("list", { name: "Messages", exact: true })
          .getByText("Hello\nTeam👋"),
      ).toBeVisible();
      await expect(
        thread.getByLabel(kind === "DIRECT" ? "Read" : "Read by 1 member", {
          exact: true,
        }),
      ).toBeVisible();

      await page.bringToFront();
      await page.getByLabel("Choose attachment").setInputFiles({
        name: "unsafe.html",
        mimeType: "text/html",
        buffer: Buffer.from("<html>unsafe</html>"),
      });
      await expect(
        page.getByRole("form", { name: "Send a message" }).getByRole("alert"),
      ).toContainText("Choose a PDF");
      const fileBytes = Buffer.from("Production notes for the team\n");
      await page.getByLabel("Choose attachment").setInputFiles({
        name: "production-notes.txt",
        mimeType: "text/plain",
        buffer: fileBytes,
      });
      await expect(
        page.getByText("production-notes.txt", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        thread.getByRole("button", { name: "Download production-notes.txt" }),
      ).toBeVisible();
      const peerThread = peerPage.getByRole("list", {
        name: "Messages",
        exact: true,
      });
      await expect(
        peerThread.getByRole("button", {
          name: "Download production-notes.txt",
        }),
      ).toBeVisible();
      const downloadPromise = peerPage.waitForEvent("download");
      await peerThread
        .getByRole("button", { name: "Download production-notes.txt" })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("production-notes.txt");
      expect(await readFile((await download.path())!)).toEqual(fileBytes);

      const image = await readFile(
        new URL(
          "../../apps/web/public/branding/lela-creative-management-logo.png",
          import.meta.url,
        ),
      );
      await page.getByLabel("Choose attachment").setInputFiles({
        name: "event-image.png",
        mimeType: "image/png",
        buffer: image,
      });
      await expect(page.getByAltText("Selected image preview")).toBeVisible();
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        peerThread.getByRole("button", { name: "Preview event-image.png" }),
      ).toBeVisible();
      await peerThread
        .getByRole("button", { name: "Preview event-image.png" })
        .click();
      await expect(
        peerPage
          .getByRole("dialog")
          .getByRole("img", { name: "event-image.png" }),
      ).toBeVisible();
      const imageDownload = peerPage.waitForEvent("download");
      await peerPage
        .getByRole("dialog")
        .getByRole("button", { name: "Download original" })
        .click();
      expect(await readFile((await (await imageDownload).path())!)).toEqual(
        image,
      );
      await peerPage
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();

      const messageList = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversation.id}/messages`,
      );
      const messages = (await messageList.json()).items;
      const attached = messages.find(
        (m: { content: string }) => m.content === "production-notes.txt",
      );
      const files = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversation.id}/messages/${attached.id}/files`,
      );
      const file = (await files.json()).items[0];
      const denied = await outsider.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversation.id}/messages/${attached.id}/files/${file.id}/download`,
      );
      expect([403, 404, 409]).toContain(denied.status());
      await peerPage.reload();
      await expect(
        peerThread.getByRole("button", { name: "Preview event-image.png" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(peerPage, `${kind} modern conversation`);
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 360, height: 800 },
      ]) {
        await peerPage.setViewportSize(viewport);
        await expect(
          peerPage.getByRole("textbox", { name: "Message", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        await expect(
          peerPage.getByRole("button", { name: "Attach file or image" }),
        ).toBeInViewport({ ratio: 1 });
        await expect(
          peerPage.getByRole("button", { name: "Send", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        if (viewport.width < 640) {
          const composer = await peerPage
            .getByRole("form", { name: "Send a message" })
            .boundingBox();
          const navigation = await peerPage
            .getByRole("navigation", { name: "Primary mobile", exact: true })
            .boundingBox();
          expect(composer!.y + composer!.height).toBeLessThanOrEqual(
            navigation!.y,
          );
        }
        expect(
          await peerPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await peerPage.screenshot({
          path: testInfo.outputPath(`${kind}-${viewport.width}.png`),
          fullPage: true,
        });
      }
      await peerPage.setViewportSize({ width: 1440, height: 900 });
      await peerPage.evaluate(() =>
        document.documentElement.classList.add("dark"),
      );
      await expectNoWcag22AaViolations(peerPage, `${kind} dark conversation`);
      await peerPage.screenshot({
        path: testInfo.outputPath(`${kind}-dark.png`),
        fullPage: true,
      });
    } finally {
      await recipient.close();
      await outsider.close();
    }
  });
}
