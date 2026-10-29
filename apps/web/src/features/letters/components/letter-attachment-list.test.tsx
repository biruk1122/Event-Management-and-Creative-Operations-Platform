import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LetterAttachmentList } from "./letter-attachment-list";
import { downloadLetterFile, getLetterFileUrl } from "../api/letters-gateway";
import type { EventFile } from "@/features/files/lib/file-types";

vi.mock("../api/letters-gateway", () => ({
  downloadLetterFile: vi.fn(),
  getLetterFileUrl: vi.fn(),
}));
const file: EventFile = {
  id: "file-1",
  filename: "Letter.txt",
  mediaType: "text/plain",
  sizeBytes: 20,
  state: "available",
  createdAt: "2026-10-22T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(downloadLetterFile).mockReset();
  vi.mocked(getLetterFileUrl)
    .mockReset()
    .mockResolvedValue("https://storage.example/private");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode("<script>plain text</script>").buffer,
    }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn().mockReturnValue("blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("letter attachments", () => {
  it("opens authorized text as text and releases the preview on close", async () => {
    const user = userEvent.setup();
    render(<LetterAttachmentList letterId="letter-1" files={[file]} />);
    await user.click(screen.getByRole("button", { name: "View Letter.txt" }));
    expect(
      await screen.findByText("<script>plain text</script>"),
    ).toBeInTheDocument();
    expect(getLetterFileUrl).toHaveBeenCalledWith("letter-1", "file-1");
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("downloads the selected attachment and shows recoverable errors", async () => {
    vi.mocked(downloadLetterFile).mockRejectedValueOnce(
      new Error("Access denied"),
    );
    const user = userEvent.setup();
    render(<LetterAttachmentList letterId="letter-1" files={[file]} />);
    await user.click(
      screen.getByRole("button", { name: "Download Letter.txt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    await user.click(
      screen.getByRole("button", { name: "Download Letter.txt" }),
    );
    expect(downloadLetterFile).toHaveBeenCalledWith("letter-1", "file-1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("offers Office downloads without promising an unsupported preview", () => {
    render(
      <LetterAttachmentList
        letterId="letter-1"
        files={[
          {
            ...file,
            filename: "Letter.docx",
            mediaType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "View Letter.docx" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download Letter.docx" }),
    ).toBeEnabled();
  });
});
