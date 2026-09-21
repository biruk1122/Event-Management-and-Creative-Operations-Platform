import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Axe tags that map the automated part of the platform's WCAG 2.2 AA gate.
 * Manual checks remain necessary for requirements that automation cannot
 * reliably determine, such as meaningful focus order and screen-reader copy.
 */
const WCAG_22_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

/** Fails a critical-flow test when axe finds a WCAG A or AA violation.
 * `ignoreRuleIds` excludes specific axe rule ids from failing this call -
 * for a known, already-tracked defect (see e.g. the `dialog-description-
 * contrast` project note) that this test should not re-litigate, without
 * silencing every other check on the same page. */
export async function expectNoWcag22AaViolations(
  page: Page,
  context: string,
  ignoreRuleIds: readonly string[] = [],
): Promise<void> {
  // Axe samples computed colors, so scanning a dialog or popover while its
  // enter animation is still running reports blended mid-transition colors as
  // false color-contrast failures (seen on slower CI runners). Wait for finite
  // animations to finish; infinite ones (spinners) never settle and are
  // excluded so they cannot stall the scan.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getComputedTiming().iterations === Infinity,
      ),
  );

  const { violations: allViolations } = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA_TAGS])
    .analyze();
  const violations = allViolations.filter(
    (violation) => !ignoreRuleIds.includes(violation.id),
  );

  expect(
    violations,
    `${context}: ${JSON.stringify(
      violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
}
