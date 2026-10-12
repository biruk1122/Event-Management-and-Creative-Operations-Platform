import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdministrationSurface } from "./administration-surface";
import { AdministrationDialogContent } from "./administration-dialog-content";
import { Dialog, DialogTitle, DialogDescription } from "./dialog";

function Fixture({ removeOpener = false }: { removeOpener?: boolean }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <>
      <div data-admin-toolbar>
        <button type="button">New record</button>
      </div>
      {!removed && (
        <button type="button" onClick={() => setOpen(true)}>
          Open record
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <AdministrationDialogContent>
          <DialogTitle>Record</DialogTitle>
          <DialogDescription>Existing record details.</DialogDescription>
          <button
            type="button"
            onClick={() => {
              setRemoved(removeOpener);
              setOpen(false);
            }}
          >
            Finish
          </button>
        </AdministrationDialogContent>
      </Dialog>
    </>
  );
}

describe("administration presentation", () => {
  it("reuses one page heading and does not invent account links or actions", () => {
    render(
      <AdministrationSurface title="Users" description="Existing workflows.">
        <p role="alert">Denied</p>
      </AdministrationSurface>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Existing workflows.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Denied");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "restores focus after close (opener removed: %s)",
    async (removeOpener) => {
      // jsdom has no layout; simulate the visible opener's client rectangle.
      const layout = vi
        .spyOn(HTMLElement.prototype, "getClientRects")
        .mockReturnValue([{}] as unknown as DOMRectList);
      try {
        const user = userEvent.setup();
        render(<Fixture removeOpener={removeOpener} />);
        await user.click(screen.getByRole("button", { name: "Open record" }));
        expect(screen.getByRole("dialog")).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Finish" }));
        await waitFor(() =>
          expect(
            screen.getByRole("button", {
              name: removeOpener ? "New record" : "Open record",
            }),
          ).toHaveFocus(),
        );
      } finally {
        layout.mockRestore();
      }
    },
  );
});
