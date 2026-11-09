import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateExpenseDialog } from "./create-expense-dialog";

describe("CreateExpenseDialog for a campaign (EVE-233)", () => {
  it("hides the event picker, offers the campaign's activities, and sends the campaign", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      status: "success",
      expense: { id: "exp-1" },
    });
    render(
      <CreateExpenseDialog
        open
        onOpenChange={vi.fn()}
        events={[]}
        suppliers={[]}
        campaignId="camp-1"
        activities={[{ id: "act-1", name: "Flyer run" }]}
        defaultCurrency="ETB"
        onCreate={onCreate}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.queryByText("Event")).toBeNull();
    await userEvent.type(screen.getByLabelText("Title (optional)"), "Flyers");
    await userEvent.selectOptions(
      screen.getByLabelText("Campaign activity (optional)"),
      "act-1",
    );
    await userEvent.type(screen.getByLabelText("Description"), "Printing");
    await userEvent.type(screen.getByLabelText("Actual amount"), "120.50");
    await userEvent.click(
      screen.getByRole("button", { name: "Create expense" }),
    );
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: "camp-1",
          campaignActivityId: "act-1",
          title: "Flyers",
          currency: "ETB",
          eventId: null,
        }),
      ),
    );
  });
});
