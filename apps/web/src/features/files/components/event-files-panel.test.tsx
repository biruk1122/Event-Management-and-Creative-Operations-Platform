import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventFilesPanel } from "./event-files-panel";

const props = {
  eventId: "event-1",
  canRead: true,
  canUpdate: true,
  listFiles: vi.fn(() => Promise.resolve([])),
  uploadFile: vi.fn((_id: string, file: File) =>
    Promise.resolve({
      id: "file-1",
      filename: file.name,
      mediaType: "application/pdf" as const,
      sizeBytes: file.size,
      state: "available" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  ),
  removeFile: vi.fn(() => Promise.resolve()),
  downloadFile: vi.fn(() => Promise.resolve()),
};

describe("EventFilesPanel", () => {
  it("shows an accessible empty state then validates and attaches an approved file", async () => {
    const user = userEvent.setup();
    render(<EventFilesPanel {...props} />);
    expect(
      await screen.findByText("No files are attached to this event yet."),
    ).toBeVisible();
    const input = screen.getByLabelText("Add a file");
    await user.upload(
      input,
      new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByText("notes.pdf (3 B)")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Attach file" }));
    expect(await screen.findByText("notes.pdf")).toBeVisible();
  });

  it("preserves the recovery path and hides mutations for read-only users", async () => {
    render(
      <EventFilesPanel
        {...props}
        canUpdate={false}
        listFiles={vi.fn(() => Promise.reject(new Error("offline")))}
      />,
    );
    expect(await screen.findByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.queryByLabelText("Add a file")).not.toBeInTheDocument();
  });

  it("states a denied result without exposing file controls", () => {
    render(<EventFilesPanel {...props} canRead={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "do not have permission",
    );
    expect(screen.queryByLabelText("Add a file")).not.toBeInTheDocument();
  });
});
