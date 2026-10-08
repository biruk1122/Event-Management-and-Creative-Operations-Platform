import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/styles/brand-tokens.css"), "utf8");
const light = css.match(/:root \{([^}]+)\}/)![1]!;
const dark = css.match(/\.dark \{([^}]+)\}/)![1]!;
const tokens = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/--([\w-]+): (#[\da-f]{6});/g)].map((m) => [m[1], m[2]]),
  );

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((n) => {
    const channel = Number.parseInt(hex.slice(n, n + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

for (const [mode, palette] of [
  ["light", tokens(light)],
  ["dark", { ...tokens(light), ...tokens(dark) }],
] as const) {
  describe(`approved ${mode} foundation palette`, () => {
    for (const [foreground, background] of [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["muted-foreground", "muted"],
      ["muted-foreground", "card"],
      ["accent-foreground", "accent"],
      ["sidebar-foreground", "sidebar"],
      ["sidebar-primary-foreground", "sidebar-primary"],
      ["sidebar-accent-foreground", "sidebar-accent"],
      ["destructive", "card"],
      ["success", "success-background"],
      ["warning", "warning-background"],
      ["information", "information-background"],
    ]) {
      it(`${foreground} on ${background} meets normal-text contrast`, () => {
        expect(
          contrast(palette[foreground!]!, palette[background!]!),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const foreground of ["border", "input", "ring"]) {
      for (const background of ["background", "card"]) {
        it(`${foreground} against ${background} meets non-text contrast`, () => {
          expect(
            contrast(palette[foreground]!, palette[background]!),
          ).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });
}

it("uses shared approved tokens without shipping specimen styles globally", () => {
  const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
  expect(globals).not.toContain("foundation-preview");
  expect(globals).toContain('"../styles/brand-tokens.css"');
});
