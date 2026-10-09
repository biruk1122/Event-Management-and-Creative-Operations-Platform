import { createRequire } from "node:module";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";

// Deterministic half-size encoding; original artwork/proportions are preserved.
const require = createRequire(
  realpathSync(resolve("apps/web/node_modules/next/package.json")),
);
const sharp = require("sharp");
await sharp("apps/web/public/branding/lela-creative-management-logo.png")
  .resize({ width: 416 })
  .webp({ lossless: true, effort: 6 })
  .toFile("apps/web/public/branding/lela-login-logo.webp");
const source = await sharp(
  "apps/web/public/branding/lela-creative-management-logo.png",
)
  .resize({ width: 416 })
  .ensureAlpha()
  .raw()
  .toBuffer();
const encoded = await sharp("apps/web/public/branding/lela-login-logo.webp")
  .ensureAlpha()
  .raw()
  .toBuffer();
if (!source.equals(encoded))
  throw new Error("Lossless logo pixel verification failed.");
console.log(
  "Verified lossless pixels against the deterministic 416x632 source resize.",
);
