import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreatePartnerDialog } from "./create-partner-dialog";

vi.mock("@/features/campaigns/api/campaigns-gateway", () => ({
  listCampaigns: () =>
    Promise.resolve({
      items: [{ id: "camp-1", name: "Festival launch" }],
      page: 1,
      pageSize: 100,
      total: 1,
    }),
}));

async function fillRequired() {
  await userEvent.type(
    screen.getByLabelText("Organization name"),
    "Brightside Media",
  );
  await userEvent.type(screen.getByLabelText("Category"), "Media");
}

describe("CreatePartnerDialog partnership fields (EVE-233)", () => {
  it("sends the partnership, its agreement and its campaign", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      status: "success",
      partner: { id: "p-1" },
    });
    render(
      <CreatePartnerDialog
        open
        onOpenChange={vi.fn()}
        onCreate={onCreate}
        onCreated={vi.fn()}
      />,
    );
    await fillRequired();
    await userEvent.type(
      screen.getByLabelText("Partnership name (optional)"),
      "Festival media",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Type (optional)"),
      "MEDIA",
    );
    await screen.findByRole("option", { name: "Festival launch" });
    await userEvent.selectOptions(
      screen.getByLabelText("Related campaign (optional)"),
      "camp-1",
    );
    await userEvent.type(
      screen.getByLabelText("Agreed value (optional)"),
      "5000",
    );
    await userEvent.type(screen.getByLabelText("Currency"), "etb");
    await userEvent.click(
      screen.getByRole("button", { name: /register|create/i }),
    );
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          partnershipName: "Festival media",
          partnershipType: "MEDIA",
          campaignId: "camp-1",
          agreedValueAmount: "5000",
          agreedValueCurrency: "ETB",
        }),
      ),
    );
  });

  it("shows the agreement-date error on its field", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      status: "field_errors",
      fieldErrors: {
        agreementEndOn: "The agreement cannot end before it starts.",
      },
    });
    render(
      <CreatePartnerDialog
        open
        onOpenChange={vi.fn()}
        onCreate={onCreate}
        onCreated={vi.fn()}
      />,
    );
    await fillRequired();
    await userEvent.click(
      screen.getByRole("button", { name: /register|create/i }),
    );
    expect(
      await screen.findByText("The agreement cannot end before it starts."),
    ).toBeInTheDocument();
  });
});
