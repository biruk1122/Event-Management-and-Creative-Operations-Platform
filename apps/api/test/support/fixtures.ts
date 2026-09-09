import { randomUUID } from "node:crypto";

/** A minimal valid user record for database and API test setup. */
export interface UserFixture {
  email: string;
}

export function fixtureName(prefix: string): string {
  const normalized = prefix.trim().replaceAll(/[^a-zA-Z0-9]+/g, "-");
  if (!normalized) {
    throw new Error("A fixture name requires a non-blank prefix.");
  }
  return `${normalized}-${randomUUID()}`.toLowerCase();
}

export function userFixture(overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    email: `${fixtureName("user")}@test.invalid`,
    ...overrides,
  };
}
