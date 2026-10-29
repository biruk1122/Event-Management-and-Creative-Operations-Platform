import { createRequire } from "node:module";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";

// Deterministic resizes matched to actual on-screen display size; originals
// are far larger than anything these assets are ever rendered at (see the CI
// quality:budgets failure this fixes).
const require = createRequire(
  realpathSync(resolve("apps/web/node_modules/next/package.json")),
);
const sharp = require("sharp");

// Sidebar brand mark: displayed at 2rem (32px) wide in shell.css's
// .shell-brand-mark; 128px (4x) gives ample headroom for high-DPI screens.
// Has alpha, so lossless WebP to keep the exact pixels, same as the existing
// lela-login-logo.webp convention.
const sidebarSource = "apps/web/public/branding/lela-sidebar-logo.png";
await sharp(sidebarSource)
  .resize({ width: 128 })
  .webp({ lossless: true, effort: 6 })
  .toFile("apps/web/public/branding/lela-sidebar-logo.webp");
const sidebarOriginalPixels = await sharp(sidebarSource)
  .resize({ width: 128 })
  .ensureAlpha()
  .raw()
  .toBuffer();
const sidebarEncodedPixels = await sharp(
  "apps/web/public/branding/lela-sidebar-logo.webp",
)
  .ensureAlpha()
  .raw()
  .toBuffer();
if (!sidebarOriginalPixels.equals(sidebarEncodedPixels)) {
  throw new Error("Sidebar logo lossless pixel verification failed.");
}
console.log(
  "Verified lossless pixels for the sidebar logo against its 128px-wide resize.",
);

// Login hero photo: a decorative cover-fit background photo
// (auth-shell.module.css's .stage) inside a panel capped at max-width 34rem
// (544px); 1200px wide covers retina displays with room to spare. Opaque
// photo, so lossy WebP is appropriate (and far smaller than lossless would
// be for photographic content).
await sharp("apps/web/public/branding/login page.png")
  .resize({ width: 1200 })
  .webp({ quality: 82 })
  .toFile("apps/web/public/branding/login-page.webp");
console.log("Re-encoded the login hero photo as a resized, lossy WebP.");
