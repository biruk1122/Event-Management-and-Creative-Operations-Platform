import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkSurface } from "./work-surface";
import { WorkDialogContent } from "./work-dialog-content";
import { Dialog, DialogTitle, DialogDescription } from "./dialog";

function Fixture({ removeOpener }: { removeOpener: boolean }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <WorkSurface>
      <div data-work-filters>
        <input aria-label="Search tasks" />
      </div>
      {!removed && <button onClick={() => setOpen(true)}>Open task</button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <WorkDialogContent>
          <DialogTitle>Task</DialogTitle>
          <DialogDescription>Existing task actions.</DialogDescription>
          <button
            onClick={() => {
              setRemoved(removeOpener);
              setOpen(false);
            }}
          >
            Finish
          </button>
        </WorkDialogContent>
      </Dialog>
    </WorkSurface>
  );
}

describe("connected work presentation", () => {
  it("retains the owning task heading without introducing tabs or actions", () => {
    render(
      <WorkSurface>
        <h1>Tasks</h1>
        <p role="alert">Denied</p>
      </WorkSurface>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Denied");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "restores the work opener or surviving filter (removed: %s)",
    async (removeOpener) => {
      const layout = vi
        .spyOn(HTMLElement.prototype, "getClientRects")
        .mockReturnValue([{}] as unknown as DOMRectList);
      try {
        const user = userEvent.setup();
        render(<Fixture removeOpener={removeOpener} />);
        await user.click(screen.getByRole("button", { name: "Open task" }));
        await user.click(screen.getByRole("button", { name: "Finish" }));
        await waitFor(() =>
          expect(
            removeOpener
              ? screen.getByRole("textbox", { name: "Search tasks" })
              : screen.getByRole("button", { name: "Open task" }),
          ).toHaveFocus(),
        );
      } finally {
        layout.mockRestore();
      }
    },
  );
});
