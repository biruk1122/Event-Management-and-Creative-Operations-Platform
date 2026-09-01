import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  loadDotenv({ path, quiet: true });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy the root .env.example to .env and provide a PostgreSQL connection URL.",
  );
}

export default defineConfig({
  datasource: { url: databaseUrl },
  migrations: { path: "prisma/migrations" },
  schema: "prisma/schema.prisma",
});
