import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeActivity } from "../test-data";
import { CampaignActivities } from "./campaign-activities";
import type {
  DeleteCampaignActivityOutcome,
  SaveCampaignActivityOutcome,
} from "../lib/campaigns-outcome";
import type { CampaignActivity } from "../lib/campaigns-types";

const TEASER = makeActivity({
  id: "a1",
  name: "Teaser video",
  description: "Publish the teaser.",
  status: "COMPLETED",
  startAt: "2026-09-10T09:00:00.000Z",
  endAt: "2026-09-12T09:00:00.000Z",
});
const RADIO = makeActivity({ id: "a2", name: "Radio spots" });
const TV = makeActivity({ id: "a3", name: "Television", status: "CANCELLED" });

function setup(
  overrides: Partial<Parameters<typeof CampaignActivities>[0]> = {},
  initial: CampaignActivity[] = [TEASER, RADIO, TV],
) {
  const props = {
    campaignId: "cmp-1",
    listActivities: vi.fn((): Promise<CampaignActivity[] | null> =>
      Promise.resolve(initial),
    ),
    createActivity: vi.fn((): Promise<SaveCampaignActivityOutcome> =>
      Promise.resolve({
        status: "success",
        activity: makeActivity({ id: "a9", name: "New activity" }),
      }),
    ),
    updateActivity: vi.fn((): Promise<SaveCampaignActivityOutcome> =>
      Promise.resolve({
        status: "success",
        activity: makeActivity({ id: "a2", name: "Radio spots" }),
      }),
    ),
    deleteActivity: vi.fn((): Promise<DeleteCampaignActivityOutcome> =>
      Promise.resolve({ status: "success" }),
    ),
    onProgressChange: vi.fn(),
    ...overrides,
  };
  render(<CampaignActivities {...props} />);
  return props;
}

async function loaded() {
  await screen.findByText("Teaser video");
}

describe("CampaignActivities", () => {
  describe("loading", () => {
    it("announces loading, then lists each activity with its status and schedule", async () => {
      setup();

      expect(screen.getByText("Loading activities…")).toBeVisible();
      await loaded();

      const list = screen.getByRole("list");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      // The status shows as a badge and as the value of the inline select.
      expect(within(items[0]!).getAllByText("Completed")).toHaveLength(2);
      expect(
        within(items[0]!).getByRole("combobox", {
          name: "Status of Teaser video",
        }),
      ).toHaveTextContent("Completed");
      expect(within(items[0]!).getByText("Publish the teaser.")).toBeVisible();
      expect(within(items[0]!).getByText(/–/)).toBeVisible();
      expect(within(items[1]!).getByText("Not scheduled")).toBeVisible();
    });

    it("derives the progress bar from the loaded activities", async () => {
      setup();
      await loaded();

      // Completed 1 of 2 counted (the cancelled one is excluded).
      expect(
        screen.getByRole("progressbar", { name: "Progress from activities" }),
      ).toHaveAttribute("aria-valuenow", "50");
    });

    it("shows an empty state that says what to do", async () => {
      setup({}, []);

      expect(
        await screen.findByText(/No activities yet\. Add the first/),
      ).toBeVisible();
      expect(screen.getByText("No activities counted yet")).toBeVisible();
    });

    it("recovers from a failed load with a retry", async () => {
      const user = userEvent.setup();
      const listActivities = vi
        .fn<() => Promise<CampaignActivity[] | null>>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([TEASER]);
      setup({ listActivities });

      expect(
        await screen.findByText("We could not load the activities"),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Add activity" }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("Teaser video")).toBeVisible();
      expect(listActivities).toHaveBeenCalledTimes(2);
    });

    it("treats a rejected load as a failed load", async () => {
      setup({ listActivities: vi.fn(() => Promise.reject(new Error("boom"))) });

      expect(
        await screen.findByText("We could not load the activities"),
      ).toBeVisible();
    });
  });

  describe("adding", () => {
    it("opens a labelled form with focus on the name and closes it on cancel", async () => {
      const user = userEvent.setup();
      setup();
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));

      const form = screen.getByRole("form", { name: "New activity" });
      expect(within(form).getByLabelText("Activity name")).toHaveFocus();
      // The header button hides while the form is open; only the form's own
      // submit button carries that name.
      expect(
        screen.getAllByRole("button", { name: "Add activity" }),
      ).toHaveLength(1);
      expect(
        within(form).getByRole("button", { name: "Add activity" }),
      ).toBeVisible();

      await user.click(within(form).getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByRole("form", { name: "New activity" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add activity" }),
      ).toBeVisible();
    });

    it("creates an activity, lists it, and reports the new progress", async () => {
      const user = userEvent.setup();
      const created = makeActivity({
        id: "a9",
        name: "Billboards",
        status: "COMPLETED",
      });
      const props = setup({
        createActivity: vi.fn(() =>
          Promise.resolve({
            status: "success" as const,
            activity: created,
          }),
        ),
      });
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Billboards");
      await user.type(
        screen.getByLabelText("Activity description"),
        "City centre.",
      );
      await user.click(
        screen.getByRole("combobox", { name: "Activity status" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );
      await user.click(screen.getByRole("button", { name: "Add activity" }));

      await waitFor(() =>
        expect(props.createActivity).toHaveBeenCalledWith("cmp-1", {
          name: "Billboards",
          description: "City centre.",
          status: "COMPLETED",
          startAt: "",
          endAt: "",
        }),
      );
      expect(await screen.findByText("Billboards")).toBeVisible();
      // Two of three counted activities are now complete.
      expect(props.onProgressChange).toHaveBeenLastCalledWith({
        completedActivities: 2,
        totalActivities: 3,
        percent: 67,
      });
      expect(screen.getByText("Activity added.")).toBeInTheDocument();
      expect(
        screen.queryByRole("form", { name: "New activity" }),
      ).not.toBeInTheDocument();
    });

    it("requires a name and never calls the API without one", async () => {
      const user = userEvent.setup();
      const props = setup();
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      expect(await screen.findByText("Enter a name.")).toBeVisible();
      expect(screen.getByLabelText("Activity name")).toBeInvalid();
      expect(props.createActivity).not.toHaveBeenCalled();
    });

    it("flags an end before the start without calling the API", async () => {
      const user = userEvent.setup();
      const props = setup();
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Backwards");
      await user.type(
        screen.getByLabelText("Activity starts (UTC)"),
        "2026-10-02T10:00",
      );
      await user.type(
        screen.getByLabelText("Activity ends (UTC)"),
        "2026-10-01T10:00",
      );
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      expect(
        await screen.findByText("The end must be on or after the start."),
      ).toBeVisible();
      expect(screen.getByLabelText("Activity ends (UTC)")).toBeInvalid();
      expect(props.createActivity).not.toHaveBeenCalled();
    });

    it("keeps the form and the typed values when the save fails", async () => {
      const user = userEvent.setup();
      const props = setup({
        createActivity: vi.fn(() =>
          Promise.resolve({ status: "unexpected" as const }),
        ),
      });
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Keep me");
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      expect(
        await screen.findByText("We could not save that change. Try again."),
      ).toBeVisible();
      expect(screen.getByLabelText("Activity name")).toHaveValue("Keep me");
      expect(props.onProgressChange).not.toHaveBeenCalled();
    });

    it("shows a server-side name error next to the field", async () => {
      const user = userEvent.setup();
      setup({
        createActivity: vi.fn(() =>
          Promise.resolve({
            status: "field_errors" as const,
            fieldErrors: { name: "That name is already used." },
          }),
        ),
      });
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Dup");
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      expect(
        await screen.findByText("That name is already used."),
      ).toBeVisible();
    });

    it("shows a server-side schedule error on the end field", async () => {
      const user = userEvent.setup();
      setup({
        createActivity: vi.fn(() =>
          Promise.resolve({ status: "schedule_invalid" as const }),
        ),
      });
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Range");
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      expect(
        await screen.findByText("The end must be on or after the start."),
      ).toBeVisible();
      expect(screen.getByLabelText("Activity ends (UTC)")).toBeInvalid();
    });

    it("disables the form and shows progress while saving", async () => {
      const user = userEvent.setup();
      let finish: (outcome: SaveCampaignActivityOutcome) => void = () =>
        undefined;
      setup({
        createActivity: vi.fn(
          () =>
            new Promise<SaveCampaignActivityOutcome>((resolve) => {
              finish = resolve;
            }),
        ),
      });
      await loaded();

      await user.click(screen.getByRole("button", { name: "Add activity" }));
      await user.type(screen.getByLabelText("Activity name"), "Slow");
      await user.click(
        screen.getAllByRole("button", { name: "Add activity" })[0]!,
      );

      const busy = await screen.findByRole("button", { name: "Saving…" });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute("aria-busy", "true");
      expect(screen.getByLabelText("Activity name")).toBeDisabled();

      finish({ status: "unexpected" });
      await screen.findByText("We could not save that change. Try again.");
    });
  });

  describe("editing", () => {
    it("opens a form filled with the activity and saves the changes", async () => {
      const user = userEvent.setup();
      const props = setup({
        updateActivity: vi.fn(() =>
          Promise.resolve({
            status: "success" as const,
            activity: { ...RADIO, name: "Radio and podcasts" },
          }),
        ),
      });
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Edit Radio spots" }),
      );

      const form = screen.getByRole("form", { name: "Edit Radio spots" });
      expect(within(form).getByLabelText("Activity name")).toHaveValue(
        "Radio spots",
      );
      await user.clear(within(form).getByLabelText("Activity name"));
      await user.type(
        within(form).getByLabelText("Activity name"),
        "Radio and podcasts",
      );
      await user.click(
        within(form).getByRole("button", { name: "Save activity" }),
      );

      await waitFor(() =>
        expect(props.updateActivity).toHaveBeenCalledWith(
          "cmp-1",
          "a2",
          expect.objectContaining({ name: "Radio and podcasts" }),
        ),
      );
      expect(await screen.findByText("Radio and podcasts")).toBeVisible();
      expect(screen.queryByText("Radio spots")).not.toBeInTheDocument();
      expect(screen.getByText("Activity saved.")).toBeInTheDocument();
    });

    it("shows the schedule of the activity being edited in datetime fields", async () => {
      const user = userEvent.setup();
      setup();
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Edit Teaser video" }),
      );

      expect(screen.getByLabelText("Activity starts (UTC)")).toHaveValue(
        "2026-09-10T09:00",
      );
      expect(screen.getByLabelText("Activity ends (UTC)")).toHaveValue(
        "2026-09-12T09:00",
      );
    });

    it("leaves the list untouched when cancelled", async () => {
      const user = userEvent.setup();
      const props = setup();
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Edit Radio spots" }),
      );
      await user.click(
        within(
          screen.getByRole("form", { name: "Edit Radio spots" }),
        ).getByRole("button", { name: "Cancel" }),
      );

      expect(props.updateActivity).not.toHaveBeenCalled();
      expect(screen.getByText("Radio spots")).toBeVisible();
    });
  });

  describe("changing status inline", () => {
    it("sends the whole activity with the new status and reports progress", async () => {
      const user = userEvent.setup();
      const props = setup({
        updateActivity: vi.fn(() =>
          Promise.resolve({
            status: "success" as const,
            activity: { ...RADIO, status: "COMPLETED" as const },
          }),
        ),
      });
      await loaded();

      await user.click(
        screen.getByRole("combobox", { name: "Status of Radio spots" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );

      await waitFor(() =>
        expect(props.updateActivity).toHaveBeenCalledWith("cmp-1", "a2", {
          name: "Radio spots",
          description: "",
          status: "COMPLETED",
          startAt: "",
          endAt: "",
        }),
      );
      expect(props.onProgressChange).toHaveBeenLastCalledWith({
        completedActivities: 2,
        totalActivities: 2,
        percent: 100,
      });
      expect(
        await screen.findByText("Radio spots marked completed."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("progressbar", { name: "Progress from activities" }),
      ).toHaveAttribute("aria-valuenow", "100");
    });

    it("shows a message beside the activity and keeps its status when it fails", async () => {
      const user = userEvent.setup();
      const props = setup({
        updateActivity: vi.fn(() =>
          Promise.resolve({ status: "permission_denied" as const }),
        ),
      });
      await loaded();

      await user.click(
        screen.getByRole("combobox", { name: "Status of Radio spots" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );

      expect(
        await screen.findByText("You do not have permission to do that."),
      ).toBeVisible();
      expect(
        screen.getByRole("combobox", { name: "Status of Radio spots" }),
      ).toHaveTextContent("Planned");
      expect(props.onProgressChange).not.toHaveBeenCalled();
    });

    it("tells the user when the activity no longer exists", async () => {
      const user = userEvent.setup();
      setup({
        updateActivity: vi.fn(() =>
          Promise.resolve({ status: "not_found" as const }),
        ),
      });
      await loaded();

      await user.click(
        screen.getByRole("combobox", { name: "Status of Radio spots" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );

      expect(
        await screen.findByText(
          "This activity no longer exists. Refresh the list.",
        ),
      ).toBeVisible();
    });
  });

  describe("removing", () => {
    it("asks for confirmation, then removes the activity and updates progress", async () => {
      const user = userEvent.setup();
      const props = setup();
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Remove Radio spots" }),
      );

      expect(screen.getByText("Remove this activity?")).toBeVisible();
      const confirm = screen.getByRole("button", {
        name: "Confirm remove Radio spots",
      });
      expect(confirm).toHaveFocus();
      expect(props.deleteActivity).not.toHaveBeenCalled();

      await user.click(confirm);

      await waitFor(() =>
        expect(props.deleteActivity).toHaveBeenCalledWith("cmp-1", "a2"),
      );
      await waitFor(() =>
        expect(screen.queryByText("Radio spots")).not.toBeInTheDocument(),
      );
      // Only the completed teaser remains counted.
      expect(props.onProgressChange).toHaveBeenLastCalledWith({
        completedActivities: 1,
        totalActivities: 1,
        percent: 100,
      });
      expect(screen.getByText("Radio spots removed.")).toBeInTheDocument();
    });

    it("backs out of a confirmation without deleting", async () => {
      const user = userEvent.setup();
      const props = setup();
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Remove Radio spots" }),
      );
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(props.deleteActivity).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Remove this activity?"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Radio spots")).toBeVisible();
    });

    it("keeps the activity and explains when the removal fails", async () => {
      const user = userEvent.setup();
      const props = setup({
        deleteActivity: vi.fn(() =>
          Promise.resolve({ status: "unexpected" as const }),
        ),
      });
      await loaded();

      await user.click(
        screen.getByRole("button", { name: "Remove Radio spots" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirm remove Radio spots" }),
      );

      expect(
        await screen.findByText("We could not save that change. Try again."),
      ).toBeVisible();
      expect(screen.getByText("Radio spots")).toBeVisible();
      expect(props.onProgressChange).not.toHaveBeenCalled();
    });
  });
});
