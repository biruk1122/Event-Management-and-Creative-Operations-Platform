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

/** Fails a critical-flow test when axe finds a WCAG A or AA violation. */
export async function expectNoWcag22AaViolations(
  page: Page,
  context: string,
): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA_TAGS])
    .analyze();

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
