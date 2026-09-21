import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EVENTS, USERS, makeCampaign } from "../test-data";
import { CreateCampaignDialog } from "./create-campaign-dialog";
import type { SaveCampaignOutcome } from "../lib/campaigns-outcome";

function setup(
  onCreate: (...args: unknown[]) => Promise<SaveCampaignOutcome> = () =>
    Promise.resolve({ status: "success", campaign: makeCampaign() }),
) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateCampaignDialog
      open
      onOpenChange={onOpenChange}
      managers={USERS}
      events={EVENTS}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { onOpenChange, onCreated };
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Create campaign" }));
}

describe("CreateCampaignDialog", () => {
  it("submits the entered values and closes on success", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
      Promise.resolve({ status: "success", campaign: makeCampaign() }),
    );
    const { onOpenChange, onCreated } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Autumn Push");
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Promotion" }));
    await user.type(screen.getByLabelText("Target audience"), "Young adults");
    await submit(user);

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Autumn Push",
        campaignType: "PROMOTION",
        description: "",
        audience: "Young adults",
        startAt: "",
        endAt: "",
        eventId: null,
        productName: "",
        managerId: null,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(makeCampaign());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("labels every field", () => {
    setup();

    for (const label of [
      "Name",
      "Type",
      "Description",
      "Target audience",
      "Starts (UTC)",
      "Ends (UTC)",
      "Related subject (optional)",
      "Manager (optional)",
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
  });

  it("blocks submit and shows a field error when the name is blank", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await submit(user);

    expect(await screen.findByText("Enter a name.")).toBeVisible();
    expect(screen.getByLabelText("Name")).toBeInvalid();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("flags an end before the start without calling the API", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Bad Range");
    await user.type(screen.getByLabelText("Starts (UTC)"), "2026-10-02T10:00");
    await user.type(screen.getByLabelText("Ends (UTC)"), "2026-10-01T10:00");
    await submit(user);

    expect(
      await screen.findByText("The end must be on or after the start."),
    ).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  describe("related subject", () => {
    it("shows no extra field until a subject kind is chosen", () => {
      setup();

      expect(screen.queryByLabelText("Event")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Product name")).not.toBeInTheDocument();
    });

    it("sends the chosen event and no product", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({ status: "success", campaign: makeCampaign() }),
      );
      setup(onCreate);

      await user.type(screen.getByLabelText("Name"), "Premiere Push");
      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(await screen.findByRole("option", { name: "An event" }));
      await user.click(screen.getByRole("combobox", { name: "Event" }));
      await user.click(
        await screen.findByRole("option", { name: "Aurora Premiere" }),
      );
      await submit(user);

      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({ eventId: "e1", productName: "" }),
        ),
      );
    });

    it("sends the entered product and no event", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({ status: "success", campaign: makeCampaign() }),
      );
      setup(onCreate);

      await user.type(screen.getByLabelText("Name"), "Speaker Push");
      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "A product" }),
      );
      await user.type(screen.getByLabelText("Product name"), "Orbit Speaker");
      await submit(user);

      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: null,
            productName: "Orbit Speaker",
          }),
        ),
      );
    });

    it("requires an event once the subject is an event", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({ status: "unexpected" }),
      );
      setup(onCreate);

      await user.type(screen.getByLabelText("Name"), "Needs Event");
      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(await screen.findByRole("option", { name: "An event" }));
      await submit(user);

      expect(await screen.findByText("Pick an event.")).toBeVisible();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("requires a product name once the subject is a product", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({ status: "unexpected" }),
      );
      setup(onCreate);

      await user.type(screen.getByLabelText("Name"), "Needs Product");
      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "A product" }),
      );
      await submit(user);

      expect(await screen.findByText("Enter a product name.")).toBeVisible();
      expect(screen.getByLabelText("Product name")).toBeInvalid();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("drops a product once the subject is switched back to none", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({ status: "success", campaign: makeCampaign() }),
      );
      setup(onCreate);

      await user.type(screen.getByLabelText("Name"), "Changed Mind");
      const subject = screen.getByRole("combobox", {
        name: "Related subject (optional)",
      });
      await user.click(subject);
      await user.click(
        await screen.findByRole("option", { name: "A product" }),
      );
      await user.type(screen.getByLabelText("Product name"), "Orbit");
      await user.click(subject);
      await user.click(
        await screen.findByRole("option", { name: "No related subject" }),
      );
      await submit(user);

      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({ eventId: null, productName: "" }),
        ),
      );
    });
  });

  it("assigns the chosen manager", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
      Promise.resolve({ status: "success", campaign: makeCampaign() }),
    );
    setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Managed");
    await user.click(
      screen.getByRole("combobox", { name: "Manager (optional)" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    await submit(user);

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ managerId: "u2" }),
      ),
    );
  });

  it("disables the form and shows progress while creating", async () => {
    const user = userEvent.setup();
    let finish: (outcome: SaveCampaignOutcome) => void = () => undefined;
    setup(
      () =>
        new Promise<SaveCampaignOutcome>((resolve) => {
          finish = resolve;
        }),
    );

    await user.type(screen.getByLabelText("Name"), "Slow");
    await submit(user);

    const busy = await screen.findByRole("button", { name: "Creating…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Name")).toBeDisabled();

    finish({ status: "unexpected" });
    await screen.findByRole("button", { name: "Create campaign" });
  });

  it.each([
    [
      { status: "manager_not_found" } as const,
      "That user no longer exists. Pick another.",
    ],
    [
      { status: "event_not_found" } as const,
      "That event no longer exists. Pick another.",
    ],
    [
      { status: "subject_conflict" } as const,
      "Choose either an event or a product, not both.",
    ],
    [
      { status: "permission_denied" } as const,
      "You do not have permission to create a campaign.",
    ],
    [
      { status: "unexpected" } as const,
      "We could not create the campaign. Try again.",
    ],
  ])("keeps the dialog open and explains %o", async (outcome, message) => {
    const user = userEvent.setup();
    const { onOpenChange, onCreated } = setup(() => Promise.resolve(outcome));

    await user.type(screen.getByLabelText("Name"), "Try Again");
    await submit(user);

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Try Again");
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows a server-side schedule error on the end field", async () => {
    const user = userEvent.setup();
    setup(() => Promise.resolve({ status: "schedule_invalid" }));

    await user.type(screen.getByLabelText("Name"), "Server Range");
    await submit(user);

    expect(
      await screen.findByText("The end must be on or after the start."),
    ).toBeVisible();
    expect(screen.getByLabelText("Ends (UTC)")).toBeInvalid();
  });

  it("shows server-side field errors next to their fields", async () => {
    const user = userEvent.setup();
    setup(() =>
      Promise.resolve({
        status: "field_errors",
        fieldErrors: { name: "That name is already taken." },
      }),
    );

    await user.type(screen.getByLabelText("Name"), "Taken");
    await submit(user);

    expect(
      await screen.findByText("That name is already taken."),
    ).toBeVisible();
  });

  it("cancels without creating and clears what was typed", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<SaveCampaignOutcome> =>
      Promise.resolve({ status: "unexpected" }),
    );
    const { onOpenChange } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Abandoned");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
