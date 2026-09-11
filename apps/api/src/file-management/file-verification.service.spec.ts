import { describe, expect, it } from "vitest";

import { FileVerificationService } from "./file-verification.service.js";

const verifier = new FileVerificationService();

describe("FileVerificationService", () => {
  it("accepts a PDF only when its bytes and declared type agree", async () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    await expect(verifier.verify("application/pdf", bytes)).resolves.toEqual({
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });
    await expect(verifier.verify("image/png", bytes)).resolves.toBeNull();
  });

  it("rejects executable-looking and binary text payloads", async () => {
    await expect(
      verifier.verify("text/plain", Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
    ).resolves.toBeNull();
    await expect(
      verifier.verify("text/csv", Buffer.from("title,owner\nCall sheet,Ada\n")),
    ).resolves.toEqual({
      mediaType: "text/csv",
      sizeBytes: 27,
    });
  });

  it("does not accept a bare ZIP as an Office document", async () => {
    await expect(
      verifier.verify(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      ),
    ).resolves.toBeNull();
  });
});
