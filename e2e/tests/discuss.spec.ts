import { expect, request, test, type Page } from "@playwright/test";

import { expectNoWcag22AaViolations } from "../fixtures/accessibility.js";
import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureEmail, fixtureName } from "../fixtures/test-data.js";
import { TEST_USER_PASSWORD, testUser } from "../fixtures/test-users.js";

/** Matches an account's own email within a conversation button's accessible
 * name - which may be prefixed with "Unread " (a brand-new conversation is
 * unread for its own creator too, until someone reads or sends into it) and
 * is always suffixed with a timestamp - without also matching
 * `dept-manager@e2e.test` as a substring of `manager@e2e.test`. */
function ownEmail(email: string): RegExp {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!dept-)${escaped}`);
}

function runDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "global setup should have exported the per-run DATABASE_URL",
    );
  }
  return url;
}

async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  expect(token, "csrf_token cookie should be present").toBeTruthy();
  return token as string;
}

async function userIdByEmail(
  requester: Pick<Page, "request">,
  email: string,
): Promise<string> {
  const response = await requester.request.get(
    `${apiBaseUrl}/api/v1/users?search=${encodeURIComponent(email)}`,
  );
  const user = (
    (await response.json()) as { items: { id: string; email: string }[] }
  ).items.find((candidate) => candidate.email === email);
  expect(user, `seeded user ${email} should be readable`).toBeTruthy();
  return user!.id;
}

interface ApiMember {
  id: string;
  email: string;
}

interface ApiConversation {
  id: string;
  type: "DIRECT" | "GROUP" | "CHANNEL";
  name: string | null;
  visibility: "PUBLIC" | "PRIVATE" | null;
  members: ApiMember[];
}

interface ApiMessage {
  id: string;
  content: string;
  parentMessageId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
}

test.describe("Direct messages and channels — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("starts a direct message, sends, edits, replies to, and pins a message, persists through reload, and is searchable", async ({
      page,
    }) => {
      const suffix = fixtureName("dm");
      const manager = testUser("manager");
      const originalContent = `E2E original message ${suffix}`;
      const replyContent = `E2E reply message ${suffix}`;
      const editedContent = `E2E edited message ${suffix}`;

      await page.goto("/");
      const navLink = page.getByRole("link", { name: "Direct messages" });
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL("/discuss/dm");

      await expect(
        page.getByRole("heading", { level: 1, name: "Direct messages" }),
      ).toBeVisible();
      await expect(page.getByLabel("Search")).toBeVisible();
      await expectNoWcag22AaViolations(page, "direct messages list");

      // Start a direct message through the real dialog.
      await page.getByRole("button", { name: "New conversation" }).click();
      const startDialog = page.getByRole("dialog");
      await expect(
        startDialog.getByRole("heading", { name: "New conversation" }),
      ).toBeVisible();
      // color-contrast excluded: a shared DialogDescription defect tracked
      // separately (see the `dialog-description-contrast` project note),
      // not something this issue's scope revisits.
      await expectNoWcag22AaViolations(page, "new conversation dialog", [
        "color-contrast",
      ]);
      // Seeded e2e accounts carry no first/last name (see provision.mjs), so
      // `personName()` falls back to email - matching teams-admin.spec.ts's
      // own convention of asserting against the seeded email, not a name.
      await startDialog.getByLabel(manager.email, { exact: true }).check();
      await startDialog.getByRole("button", { name: "Start" }).click();

      // It lands in the list, selected, with an empty thread.
      const conversationButton = page.getByRole("button", {
        name: ownEmail(manager.email),
      });
      await expect(conversationButton).toBeVisible();
      await expect(page.getByText("No messages yet. Say hello.")).toBeVisible();

      // It is readable from the authoritative store: the newest DIRECT
      // conversation whose members are exactly this admin and the manager.
      const managerId = await userIdByEmail(page, manager.email);
      const listResponse = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations?type=DIRECT&pageSize=100`,
      );
      expect(listResponse.ok()).toBe(true);
      const created = (
        (await listResponse.json()) as { items: ApiConversation[] }
      ).items.find(
        (candidate) =>
          candidate.members.length === 2 &&
          candidate.members.some((member) => member.id === managerId),
      );
      expect(
        created,
        "the new direct conversation should be readable",
      ).toBeTruthy();
      const conversationId = created!.id;

      const conversationRows = await queryInSchema<{ type: string }>(
        runDatabaseUrl(),
        `SELECT type FROM conversations WHERE id = $1`,
        [conversationId],
      );
      expect(conversationRows).toEqual([{ type: "DIRECT" }]);

      // Send a message through the composer.
      await page.getByLabel("Message", { exact: true }).fill(originalContent);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText(originalContent)).toBeVisible();

      // A `page.request` read immediately after the UI shows the message can
      // occasionally observe the store a beat before this specific fetch
      // catches up; poll rather than assume single-shot consistency.
      let sent: ApiMessage | undefined;
      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `${apiBaseUrl}/api/v1/conversations/${conversationId}/messages`,
            );
            const items = ((await response.json()) as { items: ApiMessage[] })
              .items;
            sent = items.find((item) => item.content === originalContent);
            return sent !== undefined;
          },
          { message: "the sent message should be readable" },
        )
        .toBe(true);
      const messageId = sent!.id;

      // Edit it through the message row's own form.
      const originalRow = page
        .getByRole("listitem")
        .filter({ hasText: originalContent });
      await originalRow.getByRole("button", { name: "Edit message" }).click();
      const editForm = page.getByRole("form", { name: "Edit message" });
      await editForm.getByLabel("Message", { exact: true }).fill(editedContent);
      await editForm.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(editedContent)).toBeVisible();
      await expect(page.getByText(originalContent)).toHaveCount(0);

      // Reply to it, then pin the reply.
      const editedRow = page
        .getByRole("listitem")
        .filter({ hasText: editedContent });
      await editedRow.getByRole("button", { name: "Reply" }).click();
      await expect(
        page.getByText(`Replying to: ${editedContent}`),
      ).toBeVisible();
      await page.getByLabel("Message", { exact: true }).fill(replyContent);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText(replyContent)).toBeVisible();
      await expect(
        page.getByText(`Replying to: ${editedContent}`).last(),
      ).toBeVisible();

      const replyRow = page
        .getByRole("listitem")
        .filter({ hasText: replyContent });
      await replyRow.getByRole("button", { name: "Pin message" }).click();
      await expect(replyRow.getByText("Pinned")).toBeVisible();

      // Authoritative persistence: the edit, the reply, and the pin all
      // reached the store.
      const afterEdits = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversationId}/messages`,
      );
      const items = (await afterEdits.json()) as { items: ApiMessage[] };
      const editedMessage = items.items.find((item) => item.id === messageId);
      expect(editedMessage).toMatchObject({ content: editedContent });
      expect(editedMessage!.editedAt).not.toBeNull();
      const pinnedReply = items.items.find(
        (item) => item.content === replyContent,
      );
      expect(pinnedReply).toMatchObject({ parentMessageId: messageId });
      expect(pinnedReply!.pinnedAt).not.toBeNull();

      const editedRows = await queryInSchema<{ edited_at: string | null }>(
        runDatabaseUrl(),
        `SELECT edited_at FROM messages WHERE id = $1`,
        [messageId],
      );
      expect(editedRows[0]?.edited_at).not.toBeNull();
      const pinnedRows = await queryInSchema<{ pinned_at: string | null }>(
        runDatabaseUrl(),
        `SELECT pinned_at FROM messages WHERE id = $1`,
        [pinnedReply!.id],
      );
      expect(pinnedRows[0]?.pinned_at).not.toBeNull();

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      await conversationButton.click();
      // exact: true - the reply's own row also shows a "Replying to:
      // {editedContent}" preview, which would otherwise substring-match too.
      await expect(
        page.getByText(editedContent, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(replyContent)).toBeVisible();
      await expect(
        page
          .getByRole("listitem")
          .filter({ hasText: replyContent })
          .getByText("Pinned"),
      ).toBeVisible();

      // The API's `search` filters on the channel `name` column only
      // (ListConversationsQueryDto), which is null for a direct conversation
      // - so a real search term correctly excludes it from the DM list. This
      // proves search is genuinely wired to the API, not a no-op.
      await page.getByLabel("Search").fill(suffix);
      await expect(conversationButton).toHaveCount(0);
      await page.getByLabel("Search").fill("");
      await expect(conversationButton).toBeVisible();
    });
  });

  test.describe("administrator channel journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("creates a channel, manages its name, visibility, and membership, and persists through reload", async ({
      page,
    }) => {
      const suffix = fixtureName("channel");
      const manager = testUser("manager");
      const superAdmin = testUser("superAdmin");
      const channelName = `E2E General Channel ${suffix}`;
      const renamedChannelName = `E2E Renamed Channel ${suffix}`;

      await page.goto("/discuss/channels");
      await expect(
        page.getByRole("heading", { level: 1, name: "Channels" }),
      ).toBeVisible();
      await expectNoWcag22AaViolations(page, "channels list");

      // Create a general-purpose (ownerless), public channel.
      await page.getByRole("button", { name: "New channel" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "New channel" }),
      ).toBeVisible();
      // color-contrast excluded: see the note on the new-conversation
      // dialog's own a11y check above.
      await expectNoWcag22AaViolations(page, "create channel dialog", [
        "color-contrast",
      ]);
      await createDialog.getByLabel("Name").fill(channelName);
      await createDialog
        .getByRole("button", { name: "Create channel" })
        .click();

      const channelButton = page.getByRole("button", { name: channelName });
      await expect(channelButton).toBeVisible();
      // The creator is auto-added as a member.
      await expect(
        page.getByRole("button", { name: "Members (1)" }),
      ).toBeVisible();

      const listResponse = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations?type=CHANNEL&search=${encodeURIComponent(channelName)}`,
      );
      const created = (
        (await listResponse.json()) as { items: ApiConversation[] }
      ).items.find((candidate) => candidate.name === channelName);
      expect(created, "the created channel should be readable").toBeTruthy();
      const channelId = created!.id;
      expect(created).toMatchObject({ visibility: "PUBLIC" });

      // Rename it, make it private, and add a member through the dialog.
      await page.getByRole("button", { name: "Members (1)" }).click();
      const membersDialog = page.getByRole("dialog");
      await expect(
        membersDialog.getByRole("heading", { name: "Members" }),
      ).toBeVisible();
      // color-contrast excluded: see the note on the new-conversation
      // dialog's own a11y check above.
      await expectNoWcag22AaViolations(page, "channel members dialog", [
        "color-contrast",
      ]);

      const renameForm = membersDialog.getByRole("form", {
        name: "Rename channel",
      });
      await renameForm.getByLabel("Name").fill(renamedChannelName);
      await renameForm.getByRole("button", { name: "Save" }).click();
      await expect(
        renameForm.getByRole("button", { name: "Save" }),
      ).toBeDisabled();

      await membersDialog.getByRole("combobox", { name: "Visibility" }).click();
      await page
        .getByRole("option", { name: "Private - membership by invitation" })
        .click();

      await membersDialog
        .getByRole("combobox", { name: "Add someone" })
        .click();
      await page
        .getByRole("option", { name: manager.email, exact: true })
        .click();
      await expect(
        membersDialog
          .getByRole("list", { name: "Current members" })
          .getByText(manager.email),
      ).toBeVisible();

      await page.keyboard.press("Escape");

      const afterEdits = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${channelId}`,
      );
      expect((await afterEdits.json()) as ApiConversation).toMatchObject({
        name: renamedChannelName,
        visibility: "PRIVATE",
      });
      const channelRows = await queryInSchema<{
        name: string | null;
        visibility: string | null;
      }>(
        runDatabaseUrl(),
        `SELECT name, visibility FROM conversations WHERE id = $1`,
        [channelId],
      );
      expect(channelRows).toEqual([
        { name: renamedChannelName, visibility: "PRIVATE" },
      ]);
      const memberRows = await queryInSchema<{ user_id: string }>(
        runDatabaseUrl(),
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 ORDER BY joined_at`,
        [channelId],
      );
      const managerId = await userIdByEmail(page, manager.email);
      const superAdminId = await userIdByEmail(page, superAdmin.email);
      expect(memberRows.map((row) => row.user_id).sort()).toEqual(
        [managerId, superAdminId].sort(),
      );

      // Remove the added member again.
      await page.getByRole("button", { name: `Members (2)` }).click();
      const reopenedDialog = page.getByRole("dialog");
      await reopenedDialog
        .getByRole("button", { name: `Remove ${manager.email}` })
        .click();
      await expect(
        reopenedDialog
          .getByRole("list", { name: "Current members" })
          .getByText(manager.email),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      const clearedMemberRows = await queryInSchema(
        runDatabaseUrl(),
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [channelId, managerId],
      );
      expect(clearedMemberRows).toHaveLength(0);

      // AC: the full workflow persists and reloads authoritative data.
      await page.reload();
      const renamedButton = page.getByRole("button", {
        name: renamedChannelName,
      });
      await expect(renamedButton).toBeVisible();
      await renamedButton.click();
      await expect(
        page.getByRole("button", { name: "Members (1)" }),
      ).toBeVisible();
    });
  });

  test.describe("denied journey", () => {
    // Department Manager holds `channel.create` only at DEPARTMENT scope, so
    // a general (ownerless) channel - which requires ORGANIZATION scope - is
    // a genuine, reachable denial for a real, non-`member` account (`member`'s
    // storageState is revoked by auth-session.spec.ts, see that file).
    test.use({ storageState: authStatePath("deptManager") });

    test("a Department Manager cannot create a general channel, and the attempt preserves their input", async ({
      page,
    }) => {
      const suffix = fixtureName("denied-channel");
      const forbiddenName = `E2E Denied Channel ${suffix}`;

      // Highest-risk path: a direct, correctly-formed privileged mutation is
      // refused with a stable code and writes nothing.
      const attempt = await page.request.post(
        `${apiBaseUrl}/api/v1/conversations/channels`,
        {
          headers: { "x-csrf-token": await csrfToken(page) },
          data: { name: forbiddenName, visibility: "PUBLIC" },
        },
      );
      expect(attempt.status()).toBe(403);
      expect((await attempt.json()) as { code: string }).toMatchObject({
        code: "PERMISSION_DENIED",
      });

      // The same denial through the real UI: the dialog surfaces the error
      // and preserves the typed input instead of clearing or closing.
      await page.goto("/discuss/channels");
      await page.getByRole("button", { name: "New channel" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(forbiddenName);
      await dialog.getByRole("button", { name: "Create channel" }).click();

      await expect(
        dialog.getByText(
          "You do not have permission to create a channel there.",
        ),
      ).toBeVisible();
      await expect(dialog.getByLabel("Name")).toHaveValue(forbiddenName);
      await expect(dialog).toBeVisible();

      const leaked = await queryInSchema(
        runDatabaseUrl(),
        `SELECT id FROM conversations WHERE name = $1`,
        [forbiddenName],
      );
      expect(leaked).toHaveLength(0);
    });
  });

  test.describe("conversation isolation", () => {
    test.use({ storageState: authStatePath("deptManager") });

    test("a third party cannot read a private conversation they are not a member of", async ({
      page,
    }) => {
      const manager = testUser("manager");

      // A private conversation between two other accounts, created outside
      // the acting page's own context. `GET /api/v1/users` requires
      // `user.read`, which a Department Manager does not hold, so the lookup
      // - like the conversation itself - goes through an admin context, not
      // the acting page's own (deliberately restricted) session.
      const admin = await request.newContext({
        storageState: authStatePath("superAdmin"),
      });
      const adminCsrf = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === "csrf_token",
      )?.value;
      expect(
        adminCsrf,
        "admin csrf_token cookie should be present",
      ).toBeTruthy();
      const managerId = await userIdByEmail({ request: admin }, manager.email);
      const created = await admin.post(`${apiBaseUrl}/api/v1/conversations`, {
        headers: { "x-csrf-token": adminCsrf as string },
        data: { type: "DIRECT", memberIds: [managerId] },
      });
      expect(created.status()).toBe(201);
      const conversationId = ((await created.json()) as { id: string }).id;
      await admin.dispose();

      const conversationRead = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversationId}`,
      );
      expect(conversationRead.status()).toBe(403);

      // The conversation-read boundary is a 403 (permission denial); the
      // message-list boundary is a 409 (non-membership is modeled as a
      // conflict there, per `conversationNotMember()`) - a real, deliberate
      // asymmetry in the API, not a bug this issue's scope revisits.
      const messagesRead = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations/${conversationId}/messages`,
      );
      expect(messagesRead.status()).toBe(409);

      // It does not surface in this account's own conversation list either.
      const ownList = await page.request.get(
        `${apiBaseUrl}/api/v1/conversations?type=DIRECT&pageSize=100`,
      );
      const ids = (
        (await ownList.json()) as { items: { id: string }[] }
      ).items.map((item) => item.id);
      expect(ids).not.toContain(conversationId);
    });
  });

  test.describe("session recovery", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a revoked session is refused on the Discuss route and access recovers after signing back in", async ({
      page,
      browser,
    }) => {
      // A dedicated, disposable account rather than a shared fixture:
      // revoking its session here must not break every other spec in the
      // suite that reuses that account's storage state (see realtime.spec.ts's
      // own "recovery journey" for the same pattern and reasoning).
      const csrf = await csrfToken(page);
      const email = fixtureEmail("discuss-recovery");
      const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": csrf },
        data: {
          email,
          firstName: "Discuss",
          lastName: "Recovery",
          temporaryPassword: TEST_USER_PASSWORD,
        },
      });
      expect(created.status()).toBe(201);

      const disposablePage = await browser.newPage();
      try {
        await signInThroughUi(disposablePage, {
          key: "discuss-recovery",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Discuss",
          lastName: "Recovery",
        });

        await disposablePage.goto("/discuss/dm");
        await expect(
          disposablePage.getByRole("heading", {
            level: 1,
            name: "Direct messages",
          }),
        ).toBeVisible();

        // Revoke the session through the real endpoint, matching
        // auth-session.spec.ts's own technique.
        const logout = await disposablePage.request.post(
          `${apiBaseUrl}/api/v1/auth/logout`,
          { headers: { "x-csrf-token": await csrfToken(disposablePage) } },
        );
        expect(logout.ok()).toBe(true);
        const afterLogout = await disposablePage.request.get(
          `${apiBaseUrl}/api/v1/auth/me`,
        );
        expect(afterLogout.status()).toBe(401);

        // The route's own server-side check now refuses the revoked session
        // and redirects to sign-in, preserving where to return.
        await disposablePage.reload();
        await expect(disposablePage).toHaveURL("/login?next=%2Fdiscuss%2Fdm");

        // Signing back in restores full, authoritative access to the same
        // Discuss route - the REST-based reconnect path. The login form
        // honors the preserved `next` target and returns straight to it.
        await disposablePage.getByLabel("Email", { exact: true }).fill(email);
        await disposablePage
          .getByLabel("Password", { exact: true })
          .fill(TEST_USER_PASSWORD);
        await disposablePage.getByRole("button", { name: "Sign in" }).click();
        await expect(disposablePage).toHaveURL("/discuss/dm");

        await expect(
          disposablePage.getByRole("heading", {
            level: 1,
            name: "Direct messages",
          }),
        ).toBeVisible();
        await expect(disposablePage.getByLabel("Search")).toBeVisible();
      } finally {
        await disposablePage.close();
      }
    });
  });
});
