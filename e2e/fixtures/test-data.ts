import { e2eRunId } from "./environment.js";

let sequence = 0;

/**
 * Produces a minimal, run-scoped label for data created by an e2e spec. It is
 * deliberately only available from the test harness, never application code.
 */
export function fixtureName(prefix: string): string {
  const normalized = prefix.trim().replaceAll(/[^a-zA-Z0-9]+/g, "-");
  if (!normalized) {
    throw new Error("A fixture name requires a non-blank prefix.");
  }
  sequence += 1;
  return `${normalized}-${e2eRunId}-${sequence}`;
}

export function fixtureEmail(prefix = "user"): string {
  return `${fixtureName(prefix).toLowerCase()}@e2e.test`;
}
