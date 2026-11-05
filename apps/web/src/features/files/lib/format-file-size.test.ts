import { describe, expect, it } from "vitest";

import { formatFileSize } from "./file-types";

describe("formatFileSize", () => {
  it("shows bytes below one kilobyte", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("shows kilobytes with one decimal place below one megabyte", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(40_960)).toBe("40.0 KB");
  });

  it("shows megabytes with two decimal places from one megabyte", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
    expect(formatFileSize(1_572_864)).toBe("1.50 MB");
  });
});
