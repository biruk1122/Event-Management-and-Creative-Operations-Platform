import { afterEach, describe, expect, it } from "vitest";

import { readCsrfToken } from "./csrf";

function clearCookies() {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

describe("readCsrfToken", () => {
  afterEach(clearCookies);

  it("returns null when the cookie is absent", () => {
    expect(readCsrfToken()).toBeNull();
  });

  it("reads and decodes the csrf_token cookie", () => {
    document.cookie = "other=1";
    document.cookie = `csrf_token=${encodeURIComponent("tok/with+chars=")}`;

    expect(readCsrfToken()).toBe("tok/with+chars=");
  });
});
