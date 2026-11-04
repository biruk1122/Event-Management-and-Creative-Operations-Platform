import { describe, expect, it } from "vitest";

import { talentPhotoSrc } from "./talent-photo";

describe("talentPhotoSrc", () => {
  it("returns null when the talent has no photo", () => {
    expect(talentPhotoSrc(null)).toBeNull();
    expect(talentPhotoSrc(undefined)).toBeNull();
  });

  it("resolves the API path against the API origin, keeping the version query", () => {
    expect(
      talentPhotoSrc("/api/v1/talents/tal-1/profile-image/content?v=file-9"),
    ).toBe(
      "http://localhost:4000/api/v1/talents/tal-1/profile-image/content?v=file-9",
    );
  });
});
