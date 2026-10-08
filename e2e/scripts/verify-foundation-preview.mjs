import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../test-results/lela-foundation-preview",
);
const documents = Object.fromEntries(
  await Promise.all(
    ["light", "dark"].map(async (mode) => [
      mode,
      await readFile(resolve(output, `${mode}.html`)),
    ]),
  ),
);
const server = createServer((request, response) => {
  const mode =
    request.url === "/dark"
      ? "dark"
      : request.url === "/light"
        ? "light"
        : null;
  response.writeHead(mode ? 200 : 404, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(mode ? documents[mode] : "Not found");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const evidence = [];
try {
  for (const mode of ["light", "dark"]) {
    for (const [name, width, height, deviceScaleFactor] of [
      ["mobile", 360, 800, 1],
      ["tablet", 768, 1024, 1],
      ["desktop", 1440, 900, 1],
      // 200% desktop layout equivalent: half-size CSS viewport at DPR 2.
      // This is reflow evidence, not a claim of manual browser/AT zoom testing.
      ["desktop-200pct-reflow", 720, 450, 2],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/${mode}`);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) throw new Error(`${mode}/${name}: horizontal overflow`);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      if (scan.violations.length)
        throw new Error(
          `${mode}/${name}: ${JSON.stringify(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })))}`,
        );
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => ({
        id: document.activeElement?.id,
        outline: getComputedStyle(document.activeElement).outlineStyle,
      }));
      if (focus.id !== "example-email" || focus.outline === "none")
        throw new Error(
          `${mode}/${name}: focus missing ${JSON.stringify(focus)}`,
        );
      const checkedStates = ["normal"];
      if (name === "desktop") {
        const button = page.getByRole("button", {
          name: "Primary action style",
          exact: true,
        });
        await button.hover();
        for (const state of ["hover", "pressed"]) {
          if (state === "pressed") await page.mouse.down();
          try {
            const stateScan = await new AxeBuilder({ page })
              .withTags([
                "wcag2a",
                "wcag2aa",
                "wcag21a",
                "wcag21aa",
                "wcag22aa",
              ])
              .analyze();
            if (stateScan.violations.length)
              throw new Error(
                `${mode}/${name}/${state}: ${JSON.stringify(stateScan.violations.map((v) => v.id))}`,
              );
            checkedStates.push(state);
          } finally {
            if (state === "pressed") await page.mouse.up();
          }
        }
        await page.mouse.move(0, 0);
      }
      await page.screenshot({
        path: resolve(output, `${mode}-${name}.png`),
        fullPage: true,
      });
      evidence.push({
        mode,
        viewport: { width, height },
        axeViolations: 0,
        horizontalOverflow: false,
        keyboardFocus: focus,
        reducedMotion: true,
        interactionStates: checkedStates,
        reflow:
          name === "desktop-200pct-reflow"
            ? "200%-equivalent CSS viewport at DPR 2; not manual browser zoom"
            : "default",
      });
      await context.close();
    }
  }
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `Passed ${evidence.length} isolated responsive/axe/keyboard specimen checks.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
