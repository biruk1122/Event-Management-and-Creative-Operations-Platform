import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../lib/documents-types";
import { DocumentDetailsView } from "./document-details-view";

const document = {
  id: "doc-1",
  displayName: "Annual budget",
  documentType: "REPORT",
  projectId: null,
  projectName: null,
  description: "Figures for the year.",
  fileAvailable: true,
  fileId: "file-1",
  originalFilename: "budget.pdf",
  sizeBytes: 40_960,
  uploadedAt: "2026-10-22T08:00:00Z",
  uploadedByName: "Dev Admin",
  sourceLetterId: null,
  sourceLetterReferenceNumber: null,
  createdAt: "2026-10-22T08:00:00Z",
  updatedAt: "2026-10-22T08:00:00Z",
  uploadedById: null,
} as unknown as DocumentRecord;

function setup({ startEditing = false }: { startEditing?: boolean } = {}) {
  const onUpdate = vi.fn(async () => ({
    status: "success" as const,
    document,
  }));
  render(
    <DocumentDetailsView
      backHref="/documents"
      documentId="doc-1"
      projects={[]}
      canShare={false}
      startEditing={startEditing}
      getDocument={async () => document}
      onUpdate={onUpdate}
      onChanged={vi.fn()}
    />,
  );
  return { onUpdate };
}

describe("DocumentDetailsView", () => {
  it("opens read-only with the details, and shows the file size in KB", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { name: "Annual budget" }),
    ).toBeVisible();
    expect(screen.getByText("Figures for the year.")).toBeVisible();
    expect(screen.getAllByText("40.0 KB", { exact: false })[0]).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
  });

  it("has no Edit button on the details page", async () => {
    setup();
    await screen.findByRole("heading", { name: "Annual budget" });
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("opens straight into the edit form when started in edit mode, and Cancel returns to the list", async () => {
    setup({ startEditing: true });
    expect(
      await screen.findByRole("form", { name: "Edit document" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/documents",
    );
  });
});
