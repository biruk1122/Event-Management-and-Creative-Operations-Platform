import { randomUUID } from "node:crypto";

import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";
import { TEST_USER_PASSWORD } from "../fixtures/test-users.js";

/**
 * Account lifecycle journeys on isolated accounts created for this test only.
 * The shared seeded accounts are never modified. Each journey proves that an
 * administrator's change applies on the affected user's next API call, with no
 * reload and no waiting for a cache to expire.
 */
test.describe("account permission lifecycle", () => {
  test.setTimeout(180_000);

  async function admin(): Promise<APIRequestContext> {
    return request.newContext({
      baseURL: apiBaseUrl,
      storageState: authStatePath("superAdmin"),
    });
  }

  async function csrf(context: APIRequestContext): Promise<string> {
    const state = await context.storageState();
    const token = state.cookies.find((cookie) => cookie.name === "csrf_token");
    expect(token?.value, "csrf token should be present").toBeTruthy();
    return token?.value ?? "";
  }

  async function roleId(administrator: APIRequestContext, name: string) {
    const response = await administrator.get("/api/v1/roles");
    expect(response.status()).toBe(200);
    const roles = (await response.json()) as Array<{
      id: string;
      name: string;
    }>;
    const role = roles.find((candidate) => candidate.name === name);
    expect(role, `${name} role exists`).toBeTruthy();
    return role!.id;
  }

  async function departmentIds(administrator: APIRequestContext) {
    const response = await administrator.get(
      "/api/v1/departments?pageSize=100",
    );
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: Array<{ id: string }> };
    expect(body.items.length, "two departments exist").toBeGreaterThanOrEqual(
      2,
    );
    return [body.items[0]!.id, body.items[1]!.id] as const;
  }

  async function createIsolatedUser(
    administrator: APIRequestContext,
    roleIdValue: string,
    departmentIdValue: string,
  ) {
    const email = `isolated-${randomUUID().slice(0, 8)}@e2e.test`;
    const response = await administrator.post("/api/v1/users", {
      data: {
        email,
        firstName: "Iso",
        lastName: "Lated",
        temporaryPassword: TEST_USER_PASSWORD,
        roleId: roleIdValue,
        departmentId: departmentIdValue,
      },
      headers: { "x-csrf-token": await csrf(administrator) },
    });
    expect(response.status()).toBe(201);
    const user = (await response.json()) as { id: string };
    return { id: user.id, email };
  }

  async function signedIn(email: string): Promise<APIRequestContext> {
    const session = await request.newContext({ baseURL: apiBaseUrl });
    const login = await session.post("/api/v1/auth/login", {
      data: { email, password: TEST_USER_PASSWORD },
    });
    expect(login.status(), "isolated user signs in").toBe(200);
    return session;
  }

  test("downgrading a Department Manager to Member revokes department permissions on the next request", async () => {
    const administrator = await admin();
    const managerRole = await roleId(administrator, "Department Manager");
    const memberRole = await roleId(administrator, "Department Member");
    const [departmentA] = await departmentIds(administrator);
    const user = await createIsolatedUser(
      administrator,
      managerRole,
      departmentA!,
    );
    const session = await signedIn(user.email);

    try {
      // Before: a manager may read the management dashboard (dashboard.management.read, DEPARTMENT).
      expect(
        (await session.get("/api/v1/dashboards/management")).status(),
      ).toBe(200);

      const downgrade = await administrator.put(
        `/api/v1/users/${user.id}/role`,
        {
          data: { roleId: memberRole },
          headers: { "x-csrf-token": await csrf(administrator) },
        },
      );
      expect(downgrade.status()).toBe(200);

      // Immediately after: the same session is denied, with no reload or wait.
      expect(
        (await session.get("/api/v1/dashboards/management")).status(),
      ).toBe(403);
    } finally {
      await session.dispose();
      await administrator.dispose();
    }
  });

  test("deactivating an account ends its existing session and blocks sign-in", async () => {
    const administrator = await admin();
    const memberRole = await roleId(administrator, "Department Member");
    const [departmentA] = await departmentIds(administrator);
    const user = await createIsolatedUser(
      administrator,
      memberRole,
      departmentA!,
    );
    const session = await signedIn(user.email);

    try {
      // Before: the session works.
      expect((await session.get("/api/v1/auth/me")).status()).toBe(200);

      const deactivate = await administrator.post(
        `/api/v1/users/${user.id}/deactivate`,
        {
          headers: { "x-csrf-token": await csrf(administrator) },
        },
      );
      expect(deactivate.status()).toBe(200);

      // The existing session is refused on its next request.
      expect((await session.get("/api/v1/auth/me")).status()).toBe(401);
      expect((await session.get("/api/v1/tasks")).status()).toBe(401);

      // And the account cannot sign in again.
      const login = await session.post("/api/v1/auth/login", {
        data: { email: user.email, password: TEST_USER_PASSWORD },
      });
      expect(login.status()).toBe(403);
      expect(await login.json()).toMatchObject({
        code: "AUTH_ACCOUNT_INACTIVE",
      });
    } finally {
      await session.dispose();
      await administrator.dispose();
    }
  });

  test("moving a manager to another department changes which department data they can see", async () => {
    const administrator = await admin();
    const managerRole = await roleId(administrator, "Department Manager");
    const [departmentA, departmentB] = await departmentIds(administrator);
    const user = await createIsolatedUser(
      administrator,
      managerRole,
      departmentA!,
    );
    const session = await signedIn(user.email);

    try {
      // Before: the manager sees their own department and is refused another one.
      const ownBefore = await session.get(`/api/v1/departments/${departmentA}`);
      expect(ownBefore.status()).toBe(200);
      expect(((await ownBefore.json()) as { id: string }).id).toBe(departmentA);
      expect(
        (await session.get(`/api/v1/departments/${departmentB}`)).status(),
      ).toBe(403);

      const move = await administrator.patch(`/api/v1/users/${user.id}`, {
        data: { departmentId: departmentB },
        headers: { "x-csrf-token": await csrf(administrator) },
      });
      expect(move.status()).toBe(200);

      // After: the new department is visible on the next request, and the old one is refused.
      const newAfter = await session.get(`/api/v1/departments/${departmentB}`);
      expect(newAfter.status()).toBe(200);
      expect(((await newAfter.json()) as { id: string }).id).toBe(departmentB);
      expect(
        (await session.get(`/api/v1/departments/${departmentA}`)).status(),
      ).toBe(403);

      const current = (await (
        await session.get("/api/v1/auth/me/permissions")
      ).json()) as {
        department: { id: string } | null;
      };
      expect(current.department?.id).toBe(departmentB);
    } finally {
      await session.dispose();
      await administrator.dispose();
    }
  });
});
