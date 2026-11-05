import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LetterEditView } from "./letter-edit-view";
import type { Letter } from "../lib/letters-types";

vi.mock("../api/letters-gateway", () => ({
  listLetterFiles: vi.fn().mockResolvedValue([]),
  uploadLetterFile: vi.fn(),
}));

const letter = {
  id: "letter-1",
  referenceNumber: "LELA-LTR-2026-001",
  direction: "OUTGOING",
  category: "OTHER",
  date: "2026-10-02",
  projectId: null,
  projectName: null,
  subject: "Venue confirmation",
  fromParty: "",
  toParty: "City Hall",
  senderReferenceNumber: null,
  shortDescription: null,
  remark: null,
  attachmentCount: 0,
} as unknown as Letter;

function setup(onCancel = vi.fn()) {
  render(
    <LetterEditView
      letterId={letter.id}
      projects={[]}
      canShare={false}
      backControl={<a href="/letters">Back</a>}
      onCancel={onCancel}
      getLetter={async () => letter}
      onUpdate={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
  return { onCancel };
}

describe("LetterEditView", () => {
  it("shows the header, the edit form beside the summary, and the attachments", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "Edit LELA-LTR-2026-001" }),
    ).toBeVisible();
    expect(screen.getByRole("form", { name: "Edit letter" })).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Letter summary" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Attachments" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("calls onCancel when Cancel is chosen", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
