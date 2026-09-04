import { countAppliedMigrations } from "./database.js";
import { TEST_USERS } from "./test-users.js";

/**
 * Populate a freshly migrated schema with the minimal, deterministic data an
 * end-to-end run needs.
 *
 * The platform has no business tables yet, so today this only verifies that the
 * isolated schema was migrated. When IAM-01 introduces the `User` model, insert
 * {@link TEST_USERS} here (hashing {@link TEST_USERS}[n].password) so the
 * `authenticated` Playwright project can sign in.
 */
export async function seedDatabase(connectionString: string): Promise<void> {
  const applied = await countAppliedMigrations(connectionString);
  if (applied < 1) {
    throw new Error(
      "Expected the end-to-end schema to have at least one applied migration.",
    );
  }

  // Extension point for IAM-01 / IAM-02:
  //   for (const user of TEST_USERS) {
  //     await insertUser(connectionString, { ...user, passwordHash: hash(user.password) });
  //   }
  void TEST_USERS;
}
