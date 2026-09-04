import type { components } from "@event-platform/api-client";

/** RFC 9457 Problem Details as returned by the API, with its stable `code`. */
export type ProblemDetails = components["schemas"]["ProblemDetails"];

/**
 * Narrow an `openapi-fetch` error body to a Problem Details payload. Every
 * error response from this API is Problem-Details shaped, including the
 * pre-routing rate limiter, so this is the single place that shape is trusted.
 */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" && typeof candidate.status === "number"
  );
}

/**
 * Flatten the optional `errors` map of a validation Problem Details into
 * `field -> first message`. Accepts either a string or a string array per
 * field; anything else is ignored.
 */
export function fieldErrorsOf(
  problem: ProblemDetails | null,
): Record<string, string> {
  const errors = problem?.errors;
  if (typeof errors !== "object" || errors === null) {
    return {};
  }

  const flattened: Record<string, string> = {};
  for (const [field, value] of Object.entries(
    errors as Record<string, unknown>,
  )) {
    if (typeof value === "string") {
      flattened[field] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      flattened[field] = value[0];
    }
  }
  return flattened;
}
