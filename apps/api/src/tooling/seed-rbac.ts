import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { seedRbac } from "../rbac/seed-rbac.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Copy the root .env.example to .env and provide a PostgreSQL connection URL.",
    );
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
    const result = await prisma.$transaction((tx) => seedRbac(tx), {
      timeout: 60_000,
    });
    console.log(
      `Seeded ${result.permissions} permissions, ${result.roles} roles, ` +
        `${result.rolePermissions} role grants, and ${result.baselineGrants} ` +
        "baseline grants.",
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
