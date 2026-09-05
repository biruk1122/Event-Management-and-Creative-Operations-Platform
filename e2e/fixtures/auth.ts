import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

import { repositoryRoot } from "./environment.js";
import type { TestUser } from "./test-users.js";

/** Where `auth.setup.ts` writes each signed-in `storageState`. Gitignored. */
export function authStatePath(key: string): string {
  return resolve(repositoryRoot, "e2e", ".auth", `${key}.json`);
}

/**
 * Sign in through the real `/login` UI and wait for the post-login redirect.
 * Leaves the page authenticated (session cookies in the browser context).
 */
export async function signInThroughUi(
  page: Page,
  user: TestUser,
): Promise<void> {
  await page.goto("/login");
  // `exact` so "Password" does not also match the "Show password" toggle.
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // `safeRedirect` sends a sign-in with no `?next` to the home route.
  await expect(page).toHaveURL("/");
}
