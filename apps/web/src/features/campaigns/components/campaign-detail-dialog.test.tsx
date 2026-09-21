import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The dialog default-imports read helpers from the gateway, which pulls in the
// real browser API client and validates public env vars at import time. Every
// test here injects its own readers, so a stub client keeps that import chain
// from throwing.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import {
  ALL_ABILITIES,
  EVENTS,
  TEAMS,
  USERS,
  makeActivity,
  makeCampaign,
} from "../test-data";
import { CampaignDetailDialog } from "./campaign-detail-dialog";
import type {
  DeleteCampaignOutcome,
  SetCampaignBudgetOutcome,
  TransitionCampaignOutcome,
  UpdateCampaignOutcome,
} from "../lib/campaigns-outcome";
import type {
  Campaign,
  CampaignActivity,
  CampaignBudget,
} from "../lib/campaigns-types";

function renderDialog(
  overrides: Partial<Parameters<typeof CampaignDetailDialog>[0]> = {},
) {
  const props = {
    campaignId: "cmp-1" as string | null,
    onOpenChange: vi.fn(),
    users: USERS,
    teams: TEAMS,
    events: EVENTS,
    abilities: ALL_ABILITIES,
    getCampaign: vi.fn((): Promise<Campaign | null> =>
      Promise.resolve(makeCampaign()),
    ),
    getBudget: vi.fn((): Promise<CampaignBudget | null> =>
      Promise.resolve({ amount: null, currency: null }),
    ),
    listActivities: vi.fn((): Promise<CampaignActivity[] | null> =>
      Promise.resolve([]),
    ),
    onCreateActivity: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        activity: makeActivity({ id: "a9", name: "Billboards" }),
      }),
    ),
    onUpdateActivity: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        activity: makeActivity({ id: "a1", status: "COMPLETED" }),
      }),
    ),
    onDeleteActivity: vi.fn(() =>
      Promise.resolve({ status: "success" as const }),
    ),
    onUpdate: vi.fn((): Promise<UpdateCampaignOutcome> =>
      Promise.resolve({
        status: "success",
        campaign: makeCampaign({ name: "Renamed" }),
      }),
    ),
    onTransition: vi.fn((): Promise<TransitionCampaignOutcome> =>
      Promise.resolve({
        status: "success",
        campaign: makeCampaign({ status: "ACTIVE" }),
      }),
    ),
    onAssignManager: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        campaign: makeCampaign({ manager: USERS[0]! }),
      }),
    ),
    onAssignTeam: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        campaign: makeCampaign({
          teams: [
            { id: "t1", name: "Marketing Team" },
            { id: "t2", name: "Content Studio" },
          ],
        }),
      }),
    ),
    onRemoveTeam: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        campaign: makeCampaign({ teams: [] }),
      }),
    ),
    onSetBudget: vi.fn((): Promise<SetCampaignBudgetOutcome> =>
      Promise.resolve({
        status: "success",
        budget: { amount: "5000.00", currency: "USD" },
      }),
    ),
    onDelete: vi.fn((): Promise<DeleteCampaignOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onChanged: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  render(<CampaignDetailDialog {...props} />);
  return props;
}

async function waitForLoaded(name = "Aurora Awareness") {
  return within(await screen.findByRole("dialog")).findByRole("heading", {
    name,
  });
}

describe("CampaignDetailDialog", () => {
  describe("loading", () => {
    it("announces loading first", () => {
      renderDialog({
        getCampaign: vi.fn(() => new Promise<Campaign | null>(() => undefined)),
      });

      expect(screen.getByText("Loading campaign…")).toBeVisible();
    });

    it("loads the campaign and shows its details, subject, and people", async () => {
      renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(
            makeCampaign({
              eventId: "e1",
              startAt: "2026-10-01T18:00:00.000Z",
              endAt: "2026-10-04T18:00:00.000Z",
            }),
          ),
        ),
      });
      await waitForLoaded();

      expect(screen.getByLabelText("Name")).toHaveValue("Aurora Awareness");
      expect(screen.getByLabelText("Target audience")).toHaveValue("Film fans");
      expect(screen.getByLabelText("Starts (UTC)")).toHaveValue(
        "2026-10-01T18:00",
      );
      expect(screen.getByText(/Event: Aurora Premiere/)).toBeVisible();
      expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
        "Aurora Premiere",
      );
      expect(screen.getByText("Marketing Team")).toBeVisible();
      expect(screen.getByText("Dana Okafor")).toBeVisible();
    });

    it("shows the product for a product campaign", async () => {
      renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(makeCampaign({ productName: "Orbit Speaker" })),
        ),
      });
      await waitForLoaded();

      expect(screen.getByText(/Product: Orbit Speaker/)).toBeVisible();
      expect(screen.getByLabelText("Product name")).toHaveValue(
        "Orbit Speaker",
      );
    });

    it("shows an error state when the campaign cannot be loaded", async () => {
      renderDialog({ getCampaign: vi.fn(() => Promise.resolve(null)) });

      expect(
        await screen.findByText("We could not load this campaign"),
      ).toBeVisible();
    });

    it("shows the same error state when loading throws", async () => {
      renderDialog({
        getCampaign: vi.fn(() => Promise.reject(new Error("network"))),
      });

      expect(
        await screen.findByText("We could not load this campaign"),
      ).toBeVisible();
    });

    it("renders nothing when no campaign is selected", () => {
      renderDialog({ campaignId: null });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("details", () => {
    it("saves edited details and reports the updated campaign", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed");
      await user.click(screen.getByRole("button", { name: "Save details" }));

      await waitFor(() =>
        expect(props.onUpdate).toHaveBeenCalledWith(
          "cmp-1",
          expect.objectContaining({
            name: "Renamed",
            campaignType: "PROMOTION",
            audience: "Film fans",
            eventId: null,
            productName: "",
          }),
        ),
      );
      expect(props.onChanged).toHaveBeenCalledWith(
        makeCampaign({ name: "Renamed" }),
      );
      expect(
        await screen.findByText("Campaign details saved."),
      ).toBeInTheDocument();
    });

    it("switches from a product to an event and clears the product", async () => {
      const user = userEvent.setup();
      const props = renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(makeCampaign({ productName: "Orbit Speaker" })),
        ),
      });
      await waitForLoaded();

      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(await screen.findByRole("option", { name: "An event" }));
      await user.click(screen.getByRole("combobox", { name: "Event" }));
      await user.click(
        await screen.findByRole("option", { name: "Orbit Launch" }),
      );
      await user.click(screen.getByRole("button", { name: "Save details" }));

      await waitFor(() =>
        expect(props.onUpdate).toHaveBeenCalledWith(
          "cmp-1",
          expect.objectContaining({ eventId: "e2", productName: "" }),
        ),
      );
    });

    it("blocks a blank name and an unselected event without calling the API", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.clear(screen.getByLabelText("Name"));
      await user.click(
        screen.getByRole("combobox", { name: "Related subject (optional)" }),
      );
      await user.click(await screen.findByRole("option", { name: "An event" }));
      await user.click(screen.getByRole("button", { name: "Save details" }));

      expect(await screen.findByText("Enter a name.")).toBeVisible();
      expect(screen.getByText("Pick an event.")).toBeVisible();
      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it("flags an end before the start", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.type(
        screen.getByLabelText("Starts (UTC)"),
        "2026-10-02T10:00",
      );
      await user.type(screen.getByLabelText("Ends (UTC)"), "2026-10-01T10:00");
      await user.click(screen.getByRole("button", { name: "Save details" }));

      expect(
        await screen.findByText("The end must be on or after the start."),
      ).toBeVisible();
      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it.each([
      ["event_not_found", "That event no longer exists."],
      ["subject_conflict", "Choose either an event or a product, not both."],
      ["schedule_invalid", "The end must be on or after the start."],
      [
        "not_found",
        "This campaign no longer exists. Close this and refresh the list.",
      ],
      ["permission_denied", "You do not have permission to do that."],
      ["unexpected", "We could not save that change. Try again."],
    ] as const)("explains a failed save (%s)", async (status, message) => {
      const user = userEvent.setup();
      renderDialog({
        onUpdate: vi.fn(() => Promise.resolve({ status })),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Save details" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      // The typed values survive a failed save.
      expect(screen.getByLabelText("Name")).toHaveValue("Aurora Awareness");
    });

    it("shows server-side field errors next to their fields", async () => {
      const user = userEvent.setup();
      renderDialog({
        onUpdate: vi.fn(() =>
          Promise.resolve({
            status: "field_errors" as const,
            fieldErrors: { name: "That name is already taken." },
          }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Save details" }));

      expect(
        await screen.findByText("That name is already taken."),
      ).toBeVisible();
    });

    it("disables the form and shows progress while saving", async () => {
      const user = userEvent.setup();
      let finish: (outcome: UpdateCampaignOutcome) => void = () => undefined;
      renderDialog({
        onUpdate: vi.fn(
          () =>
            new Promise<UpdateCampaignOutcome>((resolve) => {
              finish = resolve;
            }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Save details" }));

      const busy = await screen.findByRole("button", { name: "Saving…" });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute("aria-busy", "true");
      expect(screen.getByLabelText("Name")).toBeDisabled();

      finish({ status: "unexpected" });
      await screen.findByRole("button", { name: "Save details" });
    });
  });

  describe("lifecycle", () => {
    it("moves the campaign through an allowed transition", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Move to" }));
      await user.click(await screen.findByRole("option", { name: "Active" }));

      await waitFor(() =>
        expect(props.onTransition).toHaveBeenCalledWith("cmp-1", "ACTIVE"),
      );
      expect(props.onChanged).toHaveBeenCalledWith(
        makeCampaign({ status: "ACTIVE" }),
      );
      expect(
        await screen.findByText("Status changed to Active."),
      ).toBeInTheDocument();
    });

    it("offers only the moves the lifecycle allows from each status", async () => {
      const user = userEvent.setup();
      renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(makeCampaign({ status: "ACTIVE" })),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Move to" }));

      expect(
        (await screen.findAllByRole("option")).map(
          (option) => option.textContent,
        ),
      ).toEqual(["Choose a status…", "Completed", "Cancelled"]);
    });

    it.each(["COMPLETED", "CANCELLED"] as const)(
      "hides the transition control for the terminal status %s",
      async (status) => {
        renderDialog({
          getCampaign: vi.fn(() => Promise.resolve(makeCampaign({ status }))),
        });
        await waitForLoaded();

        expect(screen.getByText(/is a final state\./)).toBeVisible();
        expect(
          screen.queryByRole("combobox", { name: "Move to" }),
        ).not.toBeInTheDocument();
      },
    );

    it("surfaces an action error from a rejected transition", async () => {
      const user = userEvent.setup();
      renderDialog({
        onTransition: vi.fn(() =>
          Promise.resolve({ status: "invalid_transition" as const }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Move to" }));
      await user.click(await screen.findByRole("option", { name: "Active" }));

      expect(
        await screen.findByText(
          "That move is not allowed from the current status.",
        ),
      ).toBeVisible();
    });
  });

  describe("connected workspace", () => {
    it("assigns a manager", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Manager" }));
      await user.click(
        await screen.findByRole("option", { name: "Morgan Lead" }),
      );

      await waitFor(() =>
        expect(props.onAssignManager).toHaveBeenCalledWith("cmp-1", "u1"),
      );
      expect(await screen.findByText("Manager assigned.")).toBeInTheDocument();
    });

    it("removes the manager", async () => {
      const user = userEvent.setup();
      const props = renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(makeCampaign({ manager: USERS[0]! })),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Manager" }));
      await user.click(
        await screen.findByRole("option", { name: "No manager" }),
      );

      await waitFor(() =>
        expect(props.onAssignManager).toHaveBeenCalledWith("cmp-1", null),
      );
    });

    it("explains a manager who no longer exists", async () => {
      const user = userEvent.setup();
      renderDialog({
        onAssignManager: vi.fn(() =>
          Promise.resolve({ status: "manager_not_found" as const }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Manager" }));
      await user.click(
        await screen.findByRole("option", { name: "Morgan Lead" }),
      );

      expect(
        await screen.findByText("That user no longer exists."),
      ).toBeVisible();
    });

    it("unassigns a team", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(
        screen.getByRole("button", { name: "Unassign Marketing Team" }),
      );

      await waitFor(() =>
        expect(props.onRemoveTeam).toHaveBeenCalledWith("cmp-1", "t1"),
      );
      expect(await screen.findByText("Team unassigned.")).toBeInTheDocument();
    });

    it("offers only unassigned teams and assigns one", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: "Assign a team" }));
      expect(
        (await screen.findAllByRole("option")).map(
          (option) => option.textContent,
        ),
      ).toEqual(["Choose a team…", "Content Studio"]);
      await user.click(screen.getByRole("option", { name: "Content Studio" }));

      await waitFor(() =>
        expect(props.onAssignTeam).toHaveBeenCalledWith("cmp-1", "t2"),
      );
    });

    it("hides the assign control once every team is assigned", async () => {
      renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(
            makeCampaign({
              teams: [
                { id: "t1", name: "Marketing Team" },
                { id: "t2", name: "Content Studio" },
              ],
            }),
          ),
        ),
      });
      await waitForLoaded();

      expect(
        screen.queryByRole("combobox", { name: "Assign a team" }),
      ).not.toBeInTheDocument();
    });

    it("shows empty states for no teams and no employees", async () => {
      renderDialog({
        getCampaign: vi.fn(() =>
          Promise.resolve(makeCampaign({ teams: [], participants: [] })),
        ),
      });
      await waitForLoaded();

      expect(screen.getByText("No teams assigned.")).toBeVisible();
      expect(screen.getByText("No employees assigned.")).toBeVisible();
    });

    it.each([
      ["team_not_found", "That team no longer exists."],
      ["not_assigned", "That team is not assigned to this campaign."],
      ["permission_denied", "You do not have permission to do that."],
    ] as const)(
      "explains a failed team change (%s)",
      async (status, message) => {
        const user = userEvent.setup();
        renderDialog({
          onRemoveTeam: vi.fn(() => Promise.resolve({ status })),
        });
        await waitForLoaded();

        await user.click(
          screen.getByRole("button", { name: "Unassign Marketing Team" }),
        );

        expect(await screen.findByText(message)).toBeVisible();
      },
    );
  });

  describe("budget", () => {
    it("shows the current budget", async () => {
      renderDialog({
        getBudget: vi.fn(() =>
          Promise.resolve({ amount: "25000.00", currency: "USD" }),
        ),
      });
      await waitForLoaded();

      expect(screen.getByText("Current: 25000.00 USD")).toBeVisible();
      expect(screen.getByLabelText("Amount")).toHaveValue("25000.00");
      expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    });

    it("validates before calling the API and then saves", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.type(screen.getByLabelText("Amount"), "5000");
      await user.type(screen.getByLabelText("Currency"), "us");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(/3-letter code/)).toBeVisible();
      expect(props.onSetBudget).not.toHaveBeenCalled();

      await user.clear(screen.getByLabelText("Currency"));
      await user.type(screen.getByLabelText("Currency"), "usd");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(props.onSetBudget).toHaveBeenCalledWith("cmp-1", 5000, "USD"),
      );
      expect(await screen.findByText("Current: 5000.00 USD")).toBeVisible();
      expect(screen.getByText("Budget saved.")).toBeInTheDocument();
    });

    it("rejects a missing or negative amount", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.type(screen.getByLabelText("Currency"), "USD");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText(/Enter a non-negative amount/),
      ).toBeVisible();

      await user.type(screen.getByLabelText("Amount"), "-5");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText(/Enter a non-negative amount/)).toBeVisible();
      expect(props.onSetBudget).not.toHaveBeenCalled();
    });

    it("clears the budget without validating the fields", async () => {
      const user = userEvent.setup();
      const props = renderDialog({
        getBudget: vi.fn(() =>
          Promise.resolve({ amount: "25000.00", currency: "USD" }),
        ),
        onSetBudget: vi.fn(() =>
          Promise.resolve({
            status: "success" as const,
            budget: { amount: null, currency: null },
          }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Clear" }));

      await waitFor(() =>
        expect(props.onSetBudget).toHaveBeenCalledWith("cmp-1", null, null),
      );
      expect(await screen.findByText("Budget cleared.")).toBeInTheDocument();
      expect(screen.getByText("Current: —")).toBeVisible();
      expect(screen.getByLabelText("Amount")).toHaveValue("");
    });

    it("shows a restricted state when the budget is not readable", async () => {
      renderDialog({ getBudget: vi.fn(() => Promise.resolve(null)) });
      await waitForLoaded();

      expect(
        screen.getByText("You do not have permission to view the budget."),
      ).toBeVisible();
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("explains a rejected budget save", async () => {
      const user = userEvent.setup();
      renderDialog({
        onSetBudget: vi.fn(() =>
          Promise.resolve({ status: "permission_denied" as const }),
        ),
      });
      await waitForLoaded();

      await user.type(screen.getByLabelText("Amount"), "10");
      await user.type(screen.getByLabelText("Currency"), "USD");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByText("You do not have permission to do that."),
      ).toBeVisible();
    });
  });

  describe("activities and progress", () => {
    it("shows the activities the campaign has", async () => {
      renderDialog({
        listActivities: vi.fn(() =>
          Promise.resolve([
            makeActivity({
              id: "a1",
              name: "Teaser video",
              status: "COMPLETED",
            }),
            makeActivity({ id: "a2", name: "Radio spots" }),
          ]),
        ),
      });
      await waitForLoaded();

      expect(await screen.findByText("Teaser video")).toBeVisible();
      expect(screen.getByText("Radio spots")).toBeVisible();
      expect(
        screen.getByRole("progressbar", { name: "Progress from activities" }),
      ).toHaveAttribute("aria-valuenow", "50");
    });

    it("keeps the rest of the dialog usable when the activities fail to load", async () => {
      renderDialog({ listActivities: vi.fn(() => Promise.resolve(null)) });
      await waitForLoaded();

      expect(
        await screen.findByText("We could not load the activities"),
      ).toBeVisible();
      expect(screen.getByLabelText("Name")).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Save details" }),
      ).toBeEnabled();
    });

    it("reports new progress to the list without losing unsaved edits", async () => {
      const user = userEvent.setup();
      const props = renderDialog({
        listActivities: vi.fn(() =>
          Promise.resolve([makeActivity({ id: "a1", name: "Teaser video" })]),
        ),
        onUpdateActivity: vi.fn(() =>
          Promise.resolve({
            status: "success" as const,
            activity: makeActivity({
              id: "a1",
              name: "Teaser video",
              status: "COMPLETED",
            }),
          }),
        ),
      });
      await waitForLoaded();
      await screen.findByText("Teaser video");

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Half-typed rename");
      await user.click(
        screen.getByRole("combobox", { name: "Status of Teaser video" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );

      await waitFor(() =>
        expect(props.onChanged).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "cmp-1",
            name: "Aurora Awareness",
            progress: {
              completedActivities: 1,
              totalActivities: 1,
              percent: 100,
            },
          }),
        ),
      );
      // The unsaved name the user was typing is not overwritten.
      expect(screen.getByLabelText("Name")).toHaveValue("Half-typed rename");
    });
  });

  describe("deleting", () => {
    it("confirms, then deletes the campaign", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Delete campaign" }));
      expect(
        screen.getByText(
          "Permanently delete this campaign and its activities?",
        ),
      ).toBeVisible();
      const confirm = screen.getByRole("button", { name: "Confirm delete" });
      expect(confirm).toHaveFocus();
      expect(props.onDelete).not.toHaveBeenCalled();

      await user.click(confirm);

      await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("cmp-1"));
      expect(props.onDeleted).toHaveBeenCalledWith("cmp-1");
    });

    it("backs out of a confirmation without deleting", async () => {
      const user = userEvent.setup();
      const props = renderDialog();
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Delete campaign" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(props.onDelete).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Delete campaign" }),
      ).toBeVisible();
    });

    it.each([
      [
        "has_managed_files",
        "This campaign has attached files. Remove them before deleting the campaign.",
      ],
      ["permission_denied", "You do not have permission to do that."],
      ["unexpected", "We could not save that change. Try again."],
    ] as const)(
      "keeps the campaign and explains a failed delete (%s)",
      async (status, message) => {
        const user = userEvent.setup();
        const props = renderDialog({
          onDelete: vi.fn(() => Promise.resolve({ status })),
        });
        await waitForLoaded();

        await user.click(
          screen.getByRole("button", { name: "Delete campaign" }),
        );
        await user.click(
          screen.getByRole("button", { name: "Confirm delete" }),
        );

        expect(await screen.findByText(message)).toBeVisible();
        expect(props.onDeleted).not.toHaveBeenCalled();
        expect(
          screen.getByRole("button", { name: "Delete campaign" }),
        ).toBeVisible();
      },
    );
  });

  describe("permission-aware controls", () => {
    const NONE = {
      canCreate: false,
      canUpdate: false,
      canTransition: false,
      canAssign: false,
      canReadBudget: false,
      canUpdateBudget: false,
      canManageActivities: false,
      canDelete: false,
    };

    it("shows read-only details with no save button and a note", async () => {
      renderDialog({ abilities: NONE });
      await waitForLoaded();

      expect(screen.getByLabelText("Name")).toBeDisabled();
      expect(screen.getByLabelText("Target audience")).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Save details" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/read-only access to this campaign/),
      ).toBeVisible();
    });

    it("never calls the update API without the update ability", async () => {
      const props = renderDialog({ abilities: NONE });
      await waitForLoaded();

      // The form has no submit button, but a keyboard submit must still be inert.
      const form = screen.getByRole("form", { name: "Edit campaign details" });
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );

      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it("shows the current status instead of the transition control", async () => {
      renderDialog({ abilities: NONE });
      await waitForLoaded();

      expect(screen.getByText("Current status: Planned.")).toBeVisible();
      expect(
        screen.queryByRole("combobox", { name: "Move to" }),
      ).not.toBeInTheDocument();
    });

    it("locks the manager and hides team assignment without the assign ability", async () => {
      renderDialog({ abilities: NONE });
      await waitForLoaded();

      expect(screen.getByRole("combobox", { name: "Manager" })).toBeDisabled();
      expect(screen.getByText("Marketing Team")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Unassign Marketing Team" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Assign a team" }),
      ).not.toBeInTheDocument();
    });

    it("hides the delete action without the delete ability", async () => {
      renderDialog({ abilities: NONE });
      await waitForLoaded();

      expect(
        screen.queryByRole("button", { name: "Delete campaign" }),
      ).not.toBeInTheDocument();
    });

    it("does not request the budget without the read ability and says so", async () => {
      const props = renderDialog({ abilities: NONE });
      await waitForLoaded();

      expect(props.getBudget).not.toHaveBeenCalled();
      expect(
        screen.getByText("You do not have permission to view the budget."),
      ).toBeVisible();
    });

    it("shows the budget read-only when the caller may read but not update it", async () => {
      renderDialog({
        abilities: { ...NONE, canReadBudget: true },
        getBudget: vi.fn(() =>
          Promise.resolve({ amount: "25000.00", currency: "USD" }),
        ),
      });
      await waitForLoaded();

      expect(screen.getByText("Current: 25000.00 USD")).toBeVisible();
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("hides the budget when the API refuses it even though the grant looked present", async () => {
      renderDialog({
        abilities: { ...NONE, canReadBudget: true, canUpdateBudget: true },
        getBudget: vi.fn(() => Promise.resolve(null)),
      });
      await waitForLoaded();

      expect(
        screen.getByText("You do not have permission to view the budget."),
      ).toBeVisible();
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    });

    it("lists the activities read-only without the manage ability", async () => {
      renderDialog({
        abilities: NONE,
        listActivities: vi.fn(() =>
          Promise.resolve([makeActivity({ id: "a1", name: "Teaser video" })]),
        ),
      });
      await waitForLoaded();

      expect(await screen.findByText("Teaser video")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Add activity" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit Teaser video" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Status of Teaser video" }),
      ).not.toBeInTheDocument();
    });
  });
});
