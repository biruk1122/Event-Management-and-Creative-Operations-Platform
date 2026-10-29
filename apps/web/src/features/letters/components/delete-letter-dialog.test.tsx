import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DeleteLetterDialog } from "./delete-letter-dialog";
import type { Letter } from "../lib/letters-types";
const letter = {
  id: "letter-1",
  referenceNumber: "LELA-HR-001",
  subject: "Venue confirmation",
} as Letter;
it("requires an explicit confirmation and deletes the selected letter", async () => {
  const onDelete = vi.fn().mockResolvedValue({ status: "success" }),
    onDeleted = vi.fn();
  render(
    <DeleteLetterDialog
      letter={letter}
      onDelete={onDelete}
      onDeleted={onDeleted}
      onOpenChange={vi.fn()}
    />,
  );
  expect(onDelete).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete letter" }));
  expect(onDelete).toHaveBeenCalledWith("letter-1");
  expect(onDeleted).toHaveBeenCalledOnce();
});
it("cancels without deleting", async () => {
  const onDelete = vi.fn(),
    onOpenChange = vi.fn();
  render(
    <DeleteLetterDialog
      letter={letter}
      onDelete={onDelete}
      onDeleted={vi.fn()}
      onOpenChange={onOpenChange}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onDelete).not.toHaveBeenCalled();
});
it("keeps a failed deletion visible with a permission error", async () => {
  const onDelete = vi.fn().mockResolvedValue({ status: "permission_denied" }),
    onDeleted = vi.fn();
  render(
    <DeleteLetterDialog
      letter={letter}
      onDelete={onDelete}
      onDeleted={onDeleted}
      onOpenChange={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Delete letter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "You do not have permission",
  );
  expect(onDeleted).not.toHaveBeenCalled();
});
