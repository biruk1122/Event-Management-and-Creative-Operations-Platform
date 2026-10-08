import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Resolve the locked renderer already installed with the Vitest/Vite toolchain,
// rather than hardcoding a pnpm store path or adding a production dependency.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const vitestRequire = createRequire(webRequire.resolve("vitest/package.json"));
const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
const cli = resolve(
  dirname(viteRequire.resolve("tsx/package.json")),
  "dist/cli.mjs",
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    "--tsconfig",
    resolve(root, "apps/web/tsconfig.json"),
    resolve(root, "apps/web/scripts/render-foundation-preview.mts"),
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
