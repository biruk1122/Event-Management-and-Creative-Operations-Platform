import { describe, expect, it } from "vitest";

import { clientEnvironment } from "@/env/client";

import { talentPhotoSrc } from "./talent-photo";

describe("talentPhotoSrc", () => {
  it("returns null when the talent has no photo", () => {
    expect(talentPhotoSrc(null)).toBeNull();
    expect(talentPhotoSrc(undefined)).toBeNull();
  });

  it("resolves the API path against the configured API origin, keeping the version query", () => {
    const path = "/api/v1/talents/tal-1/profile-image/content?v=file-9";
    // The expected origin is the configured one, so the test holds for any
    // host the suite is run against (localhost locally, 127.0.0.1 in CI).
    expect(talentPhotoSrc(path)).toBe(
      new URL(path, clientEnvironment.NEXT_PUBLIC_API_URL).toString(),
    );
  });
});
