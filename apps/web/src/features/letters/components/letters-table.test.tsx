import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LettersTable } from "./letters-table";
import type { Letter } from "../lib/letters-types";

const letter: Letter = {
  id: "letter-1",
  referenceNumber: "LELA-HR-001",
  subject: "Venue confirmation",
  direction: "INCOMING",
  category: "HR",
  date: "2026-10-22",
  attachmentCount: 2,
  fromParty: "Events team",
  toParty: null,
  projectId: null,
  projectName: null,
  senderReferenceNumber: null,
  shortDescription: null,
  remark: null,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
  createdById: null,
  createdByName: null,
  updatedById: null,
};
function setup(canShare = true) {
  const props = {
    letters: [letter],
    onSelect: vi.fn(),
    onOpenRemarks: vi.fn(),
    onOpenAttachments: vi.fn(),
    onShare: vi.fn(),
    canShare,
    canEdit: true,
    canDelete: true,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    page: 1,
    pageCount: 1,
    onPageChange: vi.fn(),
    filtered: false,
  };
  render(<LettersTable {...props} />);
  return props;
}
describe("Letters table actions", () => {
  it("shows distinct headers and targets the correct letter for all row actions", async () => {
    const props = setup(),
      user = userEvent.setup();
    for (const name of ["Subject", "Share", "Remarks", "Action"])
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    await user.click(table.getByRole("button", { name: "Share LELA-HR-001" }));
    expect(props.onShare).toHaveBeenCalledWith(letter);
    await user.click(
      table.getByRole("button", { name: "Attachments for LELA-HR-001" }),
    );
    expect(props.onOpenAttachments).toHaveBeenCalledWith(letter);
    await user.click(table.getByRole("button", { name: "LELA-HR-001" }));
    expect(props.onSelect).toHaveBeenCalledWith(letter.id);
    await user.click(table.getByRole("button", { name: "Edit LELA-HR-001" }));
    expect(props.onEdit).toHaveBeenCalledWith(letter.id);
    await user.click(table.getByRole("button", { name: "Delete LELA-HR-001" }));
    expect(props.onDelete).toHaveBeenCalledWith(letter);
    const cells = within(table.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(
      within(cells.at(-2)!).getByRole("button", {
        name: "Remarks for LELA-HR-001",
      }),
    ).toBeInTheDocument();
    expect(
      within(cells.at(-1)!).queryByRole("button", { name: /Remarks/ }),
    ).not.toBeInTheDocument();
  });
  it("does not expose share actions without the sharing permission", () => {
    setup(false);
    expect(
      screen.queryByRole("button", { name: /Share/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});
