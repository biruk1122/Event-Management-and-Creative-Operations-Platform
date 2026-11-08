import { describe, expect, it } from "vitest";

import {
  safeProviderResponse,
  safeText,
  WITHHELD,
} from "../src/sms/sms-redaction.js";

describe("SMS text sanitization", () => {
  it("keeps short plain tokens", () => {
    expect(safeText("Send in progress")).toBe("Send in progress");
    expect(safeText("DELIVRD")).toBe("DELIVRD");
    expect(safeText("provider rejected the request (400)")).toBe(
      "provider rejected the request (400)",
    );
  });

  it("withholds anything that could carry a phone number, a URL, an address or a credential", () => {
    for (const value of [
      "Invalid number +251911223344",
      "call 0911223344 now",
      "account 1234567",
      "https://provider.example/send",
      "reply to ops@example.test",
      "bearer abc",
      "token value",
      "secret stored",
      "password reset",
    ]) {
      expect(safeText(value), value).toBe(WITHHELD);
    }
  });

  it("treats empty and missing text as absent", () => {
    expect(safeText(null)).toBeNull();
    expect(safeText(undefined)).toBeNull();
    expect(safeText("   ")).toBeNull();
  });

  it("reduces a provider response to acknowledgement and status, dropping free text and secrets", () => {
    const raw = {
      acknowledge: "error",
      status: "Send in progress",
      message: "Invalid number +251911223344",
      description: "see https://provider.example",
      token: "leak-me",
      api_key: "sk-1234567890",
    };
    expect(safeProviderResponse(raw)).toEqual({
      acknowledge: "error",
      status: "Send in progress",
    });
  });

  it("withholds an unsafe status value without dropping the acknowledgement", () => {
    expect(
      safeProviderResponse({
        acknowledge: "success",
        status: "to +251911223344",
      }),
    ).toEqual({ acknowledge: "success", status: WITHHELD });
  });

  it("returns nothing when the response has no recognised fields or is not an object", () => {
    expect(safeProviderResponse({ message: "hello" })).toBeNull();
    expect(safeProviderResponse(null)).toBeNull();
    expect(safeProviderResponse("text")).toBeNull();
    expect(safeProviderResponse(["acknowledge"])).toBeNull();
  });
});
