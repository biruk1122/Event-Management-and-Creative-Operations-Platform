import { expect, test } from "@playwright/test";

import { authStatePath } from "../fixtures/auth.js";
import { apiBaseUrl } from "../fixtures/environment.js";

const API_READ_P95_BUDGET_MS = 750;
const SAMPLE_COUNT = 5;

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

test.describe("API performance quality gate", () => {
  test.use({ storageState: authStatePath("superAdmin") });

  test("a paginated authenticated read stays within the p95 response-time budget", async ({
    page,
  }) => {
    const url = `${apiBaseUrl}/api/v1/users?page=1&pageSize=25`;

    // Prime the application and database connection before measuring steady
    // state; cold-start time is tracked separately in release checks.
    expect((await page.request.get(url)).ok()).toBe(true);

    const samples: number[] = [];
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const startedAt = performance.now();
      const response = await page.request.get(url);
      samples.push(performance.now() - startedAt);
      expect(response.ok()).toBe(true);
    }

    const p95 = percentile95(samples);
    expect(
      p95,
      `GET /api/v1/users p95 was ${p95.toFixed(1)} ms; budget is ${API_READ_P95_BUDGET_MS} ms. Samples: ${samples.map((sample) => sample.toFixed(1)).join(", ")} ms.`,
    ).toBeLessThanOrEqual(API_READ_P95_BUDGET_MS);
  });
});
