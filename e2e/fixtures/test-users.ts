/**
 * Canonical, deterministic accounts for authenticated end-to-end journeys.
 *
 * `tests/auth.setup.ts` signs in as each of these through the real UI. The
 * email and password literals are mirrored in `scripts/provision.mjs`, which
 * seeds them - that script runs as plain Node before Playwright starts (see
 * its header comment) and cannot import this file, so keep the two in sync.
 */

export interface TestUser {
  /** Stable key used to select this user in a test. */
  readonly key: string;
  readonly email: string;
  /** Plain-text password; the seed hashes it once credential storage exists. */
  readonly password: string;
  /** Canonical role name from the permission catalogue (EVE-32). */
  readonly role:
    | "Super Admin"
    | "Management/Administrator"
    | "Department Manager"
    | "Team Member";
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
  {
    key: "deptManager",
    email: "dept-manager@e2e.test",
    password: TEST_USER_PASSWORD,
    role: "Department Manager",
    firstName: "Dana",
    lastName: "Okafor",
  },
] as const;

export function testUser(key: string): TestUser {
  const user = TEST_USERS.find((candidate) => candidate.key === key);
  if (!user) {
    throw new Error(`Unknown test user: ${key}`);
  }
  return user;
}
