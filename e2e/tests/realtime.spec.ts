import { io, type Socket } from "socket.io-client";
import { expect, test, type Page } from "@playwright/test";

import { authStatePath, signInThroughUi } from "../fixtures/auth.js";
import { queryInSchema } from "../fixtures/database.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { fixtureEmail } from "../fixtures/test-data.js";
import { TEST_USER_PASSWORD, testUser } from "../fixtures/test-users.js";

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

/**
 * The `/realtime` gateway authenticates the same way REST does: the
 * `access_token` HttpOnly cookie (ADR 0004 §1). `page.evaluate` cannot read
 * it - HttpOnly cookies are invisible to page script by design - but the
 * browser context itself is the actual cookie jar, so it reads it fine.
 */
async function realtimeCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * Opens a real `socket.io-client` connection to the same `/realtime`
 * namespace the running web app's `NEXT_PUBLIC_WS_URL` points at, carrying a
 * cookie header extracted from a real browser session. There is no page that
 * mounts the realtime UI yet (RTC-04's scope decision - no consuming feature
 * exists), so this drives the transport directly rather than through
 * `page.evaluate`, the same way `page.request` already exercises REST
 * without going through the UI elsewhere in this suite.
 */
function connectRealtime(cookieHeader?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${apiBaseUrl}/realtime`, {
      ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
      reconnection: false,
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error: Error) => reject(error));
  });
}

function ack<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: T) => resolve(response));
  });
}

/** Set by the administrator journey; reused by the denied journey below. */
let sharedWorkspaceId: string;

test.describe("Authenticated real-time platform — end to end", () => {
  test.describe("administrator success journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("connects through the real handshake and subscribes to a workspace it can read", async ({
      page,
    }) => {
      const csrf = await csrfToken(page);
      const created = await page.request.post(
        `${apiBaseUrl}/api/v1/workspaces`,
        {
          headers: { "x-csrf-token": csrf },
          data: { kind: "EVENT" },
        },
      );
      expect(created.status()).toBe(201);
      sharedWorkspaceId = ((await created.json()) as { id: string }).id;

      const cookieHeader = await realtimeCookieHeader(page);
      const room = `workspace:${sharedWorkspaceId}`;

      const first = await connectRealtime(cookieHeader);
      try {
        const response = await ack<{
          ok: boolean;
          data?: { room: string };
        }>(first, "room:subscribe", { version: 1, room });
        expect(response).toEqual({ ok: true, data: { room } });
      } finally {
        first.disconnect();
      }

      // AC: a fresh handshake reads the same authoritative persisted state,
      // not anything cached from the first connection.
      const second = await connectRealtime(cookieHeader);
      try {
        const response = await ack<{ ok: boolean }>(second, "room:subscribe", {
          version: 1,
          room,
        });
        expect(response.ok).toBe(true);
      } finally {
        second.disconnect();
      }
    });
  });

  test.describe("denied journey", () => {
    const member = testUser("member");

    test("an unauthenticated handshake is refused before a connection is ever established", async () => {
      await expect(connectRealtime()).rejects.toThrow();
    });

    test("a team member's handshake succeeds but a workspace room it cannot read is denied", async ({
      page,
    }) => {
      // auth-session.spec intentionally signs this account out; sign in again
      // to continue proving the Team Member boundary at the realtime layer.
      await signInThroughUi(page, member);
      expect(
        sharedWorkspaceId,
        "the administrator journey above should have created a workspace first",
      ).toBeTruthy();

      const cookieHeader = await realtimeCookieHeader(page);
      const socket = await connectRealtime(cookieHeader);
      try {
        const response = await ack<{
          ok: boolean;
          error?: { code: string };
        }>(socket, "room:subscribe", {
          version: 1,
          room: `workspace:${sharedWorkspaceId}`,
        });
        expect(response.ok).toBe(false);
        expect(response.error?.code).toBe("PERMISSION_DENIED");
      } finally {
        socket.disconnect();
      }
    });
  });

  test.describe("recovery journey", () => {
    test.use({ storageState: authStatePath("superAdmin") });

    test("a revoked session's cookie is refused on the next handshake, not the live one", async ({
      page,
      browser,
    }) => {
      // A dedicated, disposable account rather than the shared superAdmin
      // fixture: revoking its session here must not break every other spec
      // in this suite that reuses the superAdmin storage state.
      const csrf = await csrfToken(page);
      const email = fixtureEmail("realtime-recovery");
      const created = await page.request.post(`${apiBaseUrl}/api/v1/users`, {
        headers: { "x-csrf-token": csrf },
        data: {
          email,
          firstName: "Realtime",
          lastName: "Recovery",
          temporaryPassword: TEST_USER_PASSWORD,
        },
      });
      expect(created.status()).toBe(201);

      // A fresh browser context, not the current one: this account's cookies
      // must never land in `page`'s own context, which stays signed in as
      // the shared superAdmin fixture for other specs to keep reusing.
      const disposablePage = await browser.newPage();
      try {
        await signInThroughUi(disposablePage, {
          key: "realtime-recovery",
          email,
          password: TEST_USER_PASSWORD,
          role: "Team Member",
          firstName: "Realtime",
          lastName: "Recovery",
        });
        const cookieHeader = await realtimeCookieHeader(disposablePage);

        const first = await connectRealtime(cookieHeader);
        first.disconnect();

        const me = await disposablePage.request.get(
          `${apiBaseUrl}/api/v1/auth/me/permissions`,
        );
        expect(me.ok()).toBe(true);
        const userId = ((await me.json()) as { userId: string }).userId;

        await queryInSchema(
          runDatabaseUrl(),
          `UPDATE auth_sessions
              SET revoked_at = now(), revoked_reason = 'ADMIN_REVOKED'
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );

        // The same cookie that worked a moment ago is refused now that its
        // session is authoritatively revoked - not cached, re-checked.
        await expect(connectRealtime(cookieHeader)).rejects.toThrow();
      } finally {
        await disposablePage.close();
      }
    });
  });
});
