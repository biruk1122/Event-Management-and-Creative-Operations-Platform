import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FoundationExamples } from "../src/components/branding/foundation-examples";

// Uses the already-installed PostCSS dependency of the existing Tailwind plugin.
// No production route, server, or package dependency is added by this renderer.
const require = createRequire(import.meta.url);
const pluginPath = require.resolve("@tailwindcss/postcss");
const postcss = createRequire(pluginPath)("postcss");
const tailwind = require("@tailwindcss/postcss");
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(webRoot, "../../test-results/lela-foundation-preview");
const globalsPath = resolve(webRoot, "src/app/globals.css");
const globals = await readFile(globalsPath, "utf8");
const result = await postcss([tailwind({ base: webRoot })]).process(globals, {
  from: globalsPath,
});
const specimenCss = await readFile(
  resolve(webRoot, "src/components/branding/foundation-preview.css"),
  "utf8",
);
const logo = await readFile(
  resolve(webRoot, "public/branding/lela-creative-management-logo.png"),
);
await mkdir(output, { recursive: true });
for (const dark of [false, true]) {
  const markup = renderToStaticMarkup(
    createElement(FoundationExamples, { dark }),
  ).replaceAll(
    'href="/branding/lela-creative-management-logo.png"',
    `href="data:image/png;base64,${logo.toString("base64")}"`,
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lela foundation specimen — ${dark ? "dark" : "light"}</title><style>:root{--font-geist-sans:system-ui,sans-serif;--font-geist-mono:monospace}${result.css}\n${specimenCss}</style></head><body>${markup}</body></html>`;
  await writeFile(resolve(output, `${dark ? "dark" : "light"}.html`), html);
}
console.log(`Rendered isolated light/dark specimens to ${output}`);
