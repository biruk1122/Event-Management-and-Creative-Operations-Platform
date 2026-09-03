import { spawnSync } from "node:child_process";

const generatedFiles = [
  "packages/api-client/openapi/openapi.json",
  "packages/api-client/src/generated/schema.ts",
];
const result = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", ...generatedFiles],
  { encoding: "utf8" },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

if (result.stdout.trim()) {
  process.stderr.write(
    "Generated OpenAPI artifacts are out of date. Run `pnpm openapi:generate` and commit the results.\n",
  );
  process.stderr.write(result.stdout);
  process.exit(1);
}
