/**
 * Canonical, deterministic accounts for authenticated end-to-end journeys.
 *
 * Authentication and the `User` model are delivered by later issues (IAM-01 /
 * IAM-02). Until then these definitions are the single source of truth for the
 * seed routine and for the `authenticated` Playwright project described in
 * `README.md`; no journey signs in yet because there is nothing to sign in to.
 */

export interface TestUser {
  /** Stable key used to select this user in a test. */
  readonly key: string;
  readonly email: string;
  /** Plain-text password; the seed hashes it once credential storage exists. */
  readonly password: string;
  /** Canonical role name from the permission catalogue (EVE-32). */
  readonly role: "Super Admin" | "Management/Administrator" | "Team Member";
  readonly firstName: string;
  readonly lastName: string;
}

export const TEST_USER_PASSWORD = "e2e-Passw0rd!";

export const TEST_USERS: readonly TestUser[] = [
  {
    key: "superAdmin",
    email: "super-admin@e2e.test",
    password: TEST_USER_PASSWORD,
    role: "Super Admin",
    firstName: "Sydney",
    lastName: "Root",
  },
  {
    key: "manager",
    email: "manager@e2e.test",
    password: TEST_USER_PASSWORD,
    role: "Management/Administrator",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    key: "member",
    email: "member@e2e.test",
    password: TEST_USER_PASSWORD,
    role: "Team Member",
    firstName: "Robin",
    lastName: "Doer",
  },
] as const;

export function testUser(key: string): TestUser {
  const user = TEST_USERS.find((candidate) => candidate.key === key);
  if (!user) {
    throw new Error(`Unknown test user: ${key}`);
  }
  return user;
}
