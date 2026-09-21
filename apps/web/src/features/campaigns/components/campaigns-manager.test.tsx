import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  EVENTS,
  TEAMS,
  USERS,
  makeActivity,
  makeCampaign,
  page,
} from "../test-data";
import { CampaignsManager } from "./campaigns-manager";
import type {
  DeleteCampaignOutcome,
  SaveCampaignOutcome,
} from "../lib/campaigns-outcome";
import type { Campaign, CampaignActivity } from "../lib/campaigns-types";

const CAMPAIGNS: Campaign[] = [
  makeCampaign({
    id: "c1",
    name: "Aurora Awareness",
    campaignType: "PROMOTION",
    status: "ACTIVE",
  }),
  makeCampaign({
    id: "c2",
    name: "Orbit Launch",
    campaignType: "MARKETING",
    status: "PLANNED",
    productName: "Orbit Speaker",
  }),
  makeCampaign({
    id: "c3",
    name: "Harvest Recap",
    campaignType: "PROMOTION",
    status: "COMPLETED",
  }),
];

function renderManager(
  overrides: Partial<Parameters<typeof CampaignsManager>[0]> = {},
) {
  return render(
    <CampaignsManager
      initialPage={page(CAMPAIGNS)}
      assignableUsers={USERS}
      assignableTeams={TEAMS}
      assignableEvents={EVENTS}
      getCampaign={(id) =>
        Promise.resolve(CAMPAIGNS.find((item) => item.id === id) ?? null)
      }
      getBudget={() => Promise.resolve({ amount: null, currency: null })}
      listActivities={() => Promise.resolve([])}
      {...overrides}
    />,
  );
}

function rowButtons(name: string) {
  return screen.getAllByRole("button", { name });
}

describe("CampaignsManager", () => {
  describe("list", () => {
    it("shows the count and lists the initial page", () => {
      renderManager();

      expect(screen.getByText("3 campaigns")).toBeVisible();
      expect(rowButtons("Aurora Awareness").length).toBeGreaterThan(0);
      expect(rowButtons("Orbit Launch").length).toBeGreaterThan(0);
    });

    it("uses the singular for one campaign", () => {
      renderManager({ initialPage: page([CAMPAIGNS[0]!]) });

      expect(screen.getByText("1 campaign")).toBeVisible();
    });

    it("explains an empty list and points to the create action", () => {
      renderManager({ initialPage: page([]) });

      expect(screen.getByText("0 campaigns")).toBeVisible();
      expect(screen.getByText("No campaigns yet")).toBeVisible();
    });

    it("pages through more than one page of campaigns", async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 12 }, (_, index) =>
        makeCampaign({ id: `m${index}`, name: `Campaign ${index + 1}` }),
      );
      renderManager({ initialPage: page(many) });

      expect(screen.getByText("12 campaigns")).toBeVisible();
      expect(rowButtons("Campaign 1").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "Campaign 11" })).toBeNull();
      expect(screen.getByText("Page 1 of 2")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Next" }));

      expect(screen.getByText("Page 2 of 2")).toBeVisible();
      expect(rowButtons("Campaign 11").length).toBeGreaterThan(0);
    });
  });

  describe("filtering", () => {
    it("filters by status", async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(
        screen.getByRole("combobox", { name: "Filter by status" }),
      );
      await user.click(await screen.findByRole("option", { name: "Active" }));

      expect(screen.getByText("1 campaign match these filters")).toBeVisible();
      expect(rowButtons("Aurora Awareness").length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("button", { name: "Orbit Launch" }),
      ).not.toBeInTheDocument();
    });

    it("filters by type", async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(
        screen.getByRole("combobox", { name: "Filter by type" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Promotion" }),
      );

      expect(screen.getByText("2 campaigns match these filters")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Orbit Launch" }),
      ).not.toBeInTheDocument();
    });

    it("filters by a name search term, ignoring case and spaces", async () => {
      const user = userEvent.setup();
      renderManager();

      await user.type(screen.getByLabelText("Search"), "  ORBIT ");

      expect(screen.getByText("1 campaign match these filters")).toBeVisible();
      expect(rowButtons("Orbit Launch").length).toBeGreaterThan(0);
    });

    it("combines filters and explains when nothing matches", async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(
        screen.getByRole("combobox", { name: "Filter by status" }),
      );
      await user.click(await screen.findByRole("option", { name: "Planned" }));
      await user.click(
        screen.getByRole("combobox", { name: "Filter by type" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Promotion" }),
      );

      expect(screen.getByText("0 campaigns match these filters")).toBeVisible();
      expect(
        screen.getByText("No campaigns match these filters"),
      ).toBeVisible();
    });

    it("returns to the first page when a filter changes", async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 12 }, (_, index) =>
        makeCampaign({ id: `m${index}`, name: `Campaign ${index + 1}` }),
      );
      renderManager({ initialPage: page(many) });

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText("Page 2 of 2")).toBeVisible();
      await user.type(screen.getByLabelText("Search"), "Campaign 1");

      expect(screen.queryByText(/Page 2 of/)).not.toBeInTheDocument();
    });
  });

  describe("creating", () => {
    it("adds the new campaign to the top of the list and announces it", async () => {
      const user = userEvent.setup();
      const createCampaign = vi.fn((): Promise<SaveCampaignOutcome> =>
        Promise.resolve({
          status: "success",
          campaign: makeCampaign({ id: "c4", name: "Winter Push" }),
        }),
      );
      renderManager({ createCampaign });

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Winter Push",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      await waitFor(() =>
        expect(screen.getByText("4 campaigns")).toBeVisible(),
      );
      expect(createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Winter Push" }),
      );
      expect(screen.getByText("Campaign created.")).toBeInTheDocument();
      expect(rowButtons("Winter Push").length).toBeGreaterThan(0);
    });

    it("clears active filters so the new campaign is visible", async () => {
      const user = userEvent.setup();
      renderManager({
        createCampaign: () =>
          Promise.resolve({
            status: "success",
            campaign: makeCampaign({
              id: "c4",
              name: "Winter Push",
              campaignType: "MARKETING",
            }),
          }),
      });

      await user.click(
        screen.getByRole("combobox", { name: "Filter by type" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Promotion" }),
      );
      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Winter Push",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      await waitFor(() =>
        expect(screen.getByText("4 campaigns")).toBeVisible(),
      );
      expect(rowButtons("Winter Push").length).toBeGreaterThan(0);
    });

    it("leaves the list unchanged when the create fails", async () => {
      const user = userEvent.setup();
      renderManager({
        createCampaign: () => Promise.resolve({ status: "unexpected" }),
      });

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Won't Save",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      expect(
        await screen.findByText("We could not create the campaign. Try again."),
      ).toBeVisible();
      expect(screen.getByText("3 campaigns")).toBeVisible();
    });
  });

  describe("detail", () => {
    it("opens the detail dialog for a row and closes it again", async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(rowButtons("Orbit Launch")[0]!);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByRole("heading", { name: "Orbit Launch" });
      expect(within(dialog).getByText(/Product: Orbit Speaker/)).toBeVisible();

      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("reflects a saved change in the list", async () => {
      const user = userEvent.setup();
      renderManager({
        updateCampaign: () =>
          Promise.resolve({
            status: "success",
            campaign: makeCampaign({
              id: "c2",
              name: "Orbit Relaunch",
              campaignType: "MARKETING",
            }),
          }),
      });

      await user.click(rowButtons("Orbit Launch")[0]!);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByRole("heading", { name: "Orbit Launch" });
      await user.click(
        within(dialog).getByRole("button", { name: "Save details" }),
      );

      // The modal dialog hides the list from assistive tech while it is open.
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", {
            name: "Orbit Relaunch",
            hidden: true,
          }).length,
        ).toBeGreaterThan(0),
      );
    });

    it("removes the campaign from the list after a delete and announces it", async () => {
      const user = userEvent.setup();
      const deleteCampaign = vi.fn((): Promise<DeleteCampaignOutcome> =>
        Promise.resolve({ status: "success" }),
      );
      renderManager({ deleteCampaign });

      await user.click(rowButtons("Orbit Launch")[0]!);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByRole("heading", { name: "Orbit Launch" });
      await user.click(
        within(dialog).getByRole("button", { name: "Delete campaign" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Confirm delete" }),
      );

      await waitFor(() =>
        expect(screen.getByText("2 campaigns")).toBeVisible(),
      );
      expect(deleteCampaign).toHaveBeenCalledWith("c2");
      expect(screen.getByText("Campaign deleted.")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Orbit Launch" }),
      ).not.toBeInTheDocument();
    });

    it("keeps the campaign in the list when a delete is refused", async () => {
      const user = userEvent.setup();
      renderManager({
        deleteCampaign: () => Promise.resolve({ status: "has_managed_files" }),
      });

      await user.click(rowButtons("Orbit Launch")[0]!);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByRole("heading", { name: "Orbit Launch" });
      await user.click(
        within(dialog).getByRole("button", { name: "Delete campaign" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Confirm delete" }),
      );

      expect(
        await within(dialog).findByText(/has attached files/),
      ).toBeVisible();
      expect(screen.getByText("3 campaigns")).toBeVisible();
    });
  });

  describe("progress", () => {
    it("updates the row's progress when an activity is completed", async () => {
      const user = userEvent.setup();
      const planned: CampaignActivity = makeActivity({
        id: "a1",
        campaignId: "c1",
        name: "Teaser video",
      });
      renderManager({
        listActivities: () => Promise.resolve([planned]),
        updateActivity: () =>
          Promise.resolve({
            status: "success",
            activity: { ...planned, status: "COMPLETED" },
          }),
      });
      const table = screen.getByRole("table");
      expect(
        within(
          within(table).getByRole("row", { name: /Aurora Awareness/ }),
        ).getByText("No activities counted yet"),
      ).toBeVisible();

      await user.click(rowButtons("Aurora Awareness")[0]!);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByText("Teaser video");
      await user.click(
        within(dialog).getByRole("combobox", {
          name: "Status of Teaser video",
        }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Completed" }),
      );

      // The modal dialog hides the list from assistive tech while it is open.
      await waitFor(() =>
        expect(
          within(
            within(table).getByRole("row", {
              name: /Aurora Awareness/,
              hidden: true,
            }),
          ).getByRole("progressbar", {
            name: "Progress of Aurora Awareness",
            hidden: true,
          }),
        ).toHaveAttribute("aria-valuenow", "100"),
      );
    });
  });
});
