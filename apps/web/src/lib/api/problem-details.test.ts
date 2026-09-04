import { describe, expect, it } from "vitest";

import { fieldErrorsOf, isProblemDetails } from "./problem-details";
import type { ProblemDetails } from "./problem-details";

const base: ProblemDetails = {
  type: "https://api.event-platform.local/problems/validation_error",
  title: "Validation Failed",
  status: 400,
  detail: "One or more request values are invalid.",
  instance: "/api/v1/auth/login",
  code: "VALIDATION_ERROR",
  requestId: "req-1",
};

describe("isProblemDetails", () => {
  it("accepts a payload with a string code and numeric status", () => {
    expect(isProblemDetails(base)).toBe(true);
  });

  it("rejects non-objects and shapes missing the stable fields", () => {
    expect(isProblemDetails(null)).toBe(false);
    expect(isProblemDetails("nope")).toBe(false);
    expect(isProblemDetails({ code: "X" })).toBe(false);
    expect(isProblemDetails({ status: 400 })).toBe(false);
  });
});

describe("fieldErrorsOf", () => {
  it("returns an empty map when there is no errors object", () => {
    expect(fieldErrorsOf(base)).toEqual({});
    expect(fieldErrorsOf(null)).toEqual({});
  });

  it("keeps the first message for string and array-valued fields", () => {
    const problem = {
      ...base,
      errors: {
        email: "Enter a valid email address.",
        password: ["Password is required.", "ignored"],
        note: 42,
      },
    } as unknown as ProblemDetails;

    expect(fieldErrorsOf(problem)).toEqual({
      email: "Enter a valid email address.",
      password: "Password is required.",
    });
  });
});
