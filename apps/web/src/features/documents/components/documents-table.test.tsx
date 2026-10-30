import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DocumentRecord } from "../lib/documents-types";
import { DocumentsTable } from "./documents-table";

const document: DocumentRecord = {
  id: "doc-1",
  displayName: "Annual budget",
  description: null,
  documentType: "REPORT",
  projectId: "project-1",
  projectName: "Annual event",
  fileAvailable: true,
  fileId: "file-1",
  originalFilename: "budget.pdf",
  sizeBytes: 2048,
  uploadedAt: "2026-10-22T09:00:00Z",
  uploadedById: "user-1",
  uploadedByName: "Finance Admin",
  sourceLetterId: null,
  sourceLetterReferenceNumber: null,
  createdAt: "2026-10-21T09:00:00Z",
  updatedAt: "2026-10-22T09:00:00Z",
};

function setup(canShare = true) {
  const props = {
    documents: [document],
    onSelect: vi.fn(),
    onShare: vi.fn(),
    canShare,
    page: 1,
    pageCount: 1,
    onPageChange: vi.fn(),
    filtered: false,
  };
  render(<DocumentsTable {...props} />);
  return props;
}

describe("Documents table", () => {
  it("shows document ownership, uploader, sharing, and actions in separate columns", async () => {
    const props = setup();
    for (const name of ["Document of", "Uploaded by", "Share", "Action"])
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Annual event")).toBeInTheDocument();
    expect(table.getByText("Finance Admin")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Share Annual budget" }),
    );
    expect(props.onShare).toHaveBeenCalledWith(document);
    await user.click(
      screen.getByRole("button", { name: "Open Annual budget details" }),
    );
    expect(props.onSelect).toHaveBeenCalledWith("doc-1");
    expect(
      table.getByRole("cell", { name: "Finance Admin" }),
    ).toBeInTheDocument();
  });
  it("identifies the source letter as the document owner", () => {
    render(
      <DocumentsTable
        documents={[
          {
            ...document,
            sourceLetterId: "letter-1",
            sourceLetterReferenceNumber: "LELA-HR-001",
          },
        ]}
        onSelect={vi.fn()}
        onShare={vi.fn()}
        canShare
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );
    expect(
      within(screen.getByRole("table")).getByText("Letter LELA-HR-001"),
    ).toBeInTheDocument();
  });
  it("does not expose sharing where the user cannot share documents", () => {
    setup(false);
    expect(
      screen.queryByRole("button", { name: /Share Annual budget/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});
