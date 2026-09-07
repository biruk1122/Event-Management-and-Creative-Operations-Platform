import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { config as loadDotenv } from "dotenv";

import { PrismaClient } from "../generated/prisma/client.js";
import { seedRbac } from "../rbac/seed-rbac.js";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  loadDotenv({ path, quiet: true });
}

/**
 * Local-development helper: seed the RBAC catalogue and a single Super Admin
 * account so the app is usable end to end before any self-serve first-admin
 * flow exists. Idempotent - safe to re-run; it resets the password and clears
 * any lockout each time.
 *
 * Not wired into any environment other than a developer's own machine. The
 * credentials come from `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` or fall back
 * to the defaults printed at the end.
 */

const DEFAULT_EMAIL = "admin@dev.local";
const DEFAULT_PASSWORD = "dev-Passw0rd!";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Copy the root .env.example to .env and provide a PostgreSQL connection URL.",
    );
  }

  const email = (process.env.DEV_ADMIN_EMAIL ?? DEFAULT_EMAIL)
    .trim()
    .toLowerCase();
  const password = process.env.DEV_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  if (password.length < 8) {
    throw new Error("DEV_ADMIN_PASSWORD must be at least 8 characters.");
  }

  // The pg driver adapter ignores the `?schema=` connection parameter, so the
  // schema is passed explicitly (matches DatabaseService).
  const schema = new URL(databaseUrl).searchParams.get("schema") ?? undefined;
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl },
      schema ? { schema } : undefined,
    ),
  });

  try {
    await prisma.$transaction((tx) => seedRbac(tx), { timeout: 60_000 });

    const superAdmin = await prisma.role.findUnique({
      where: { name: "Super Admin" },
      select: { id: true },
    });
    if (!superAdmin) {
      throw new Error(
        "The 'Super Admin' role is missing after seeding the RBAC catalogue.",
      );
    }

    const passwordHash = await hash(password);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        firstName: "Dev",
        lastName: "Admin",
        credential: { create: { passwordHash, mustChangePassword: false } },
        roleAssignment: { create: { roleId: superAdmin.id } },
      },
      update: {
        status: "ACTIVE",
        deactivatedAt: null,
        credential: {
          upsert: {
            create: { passwordHash, mustChangePassword: false },
            update: {
              passwordHash,
              mustChangePassword: false,
              failedAttemptCount: 0,
              lockedUntil: null,
            },
          },
        },
        roleAssignment: {
          upsert: {
            create: { roleId: superAdmin.id },
            update: { roleId: superAdmin.id },
          },
        },
      },
      select: { id: true, email: true },
    });

    console.log(
      [
        "Seeded a local Super Admin account.",
        `  email:    ${user.email}`,
        `  password: ${password}`,
        "Sign in at /login, then open /users, /settings/roles, or /departments.",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
