import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { makeActivity, makeCampaign } from "../test-data";
import { CampaignsManager } from "./campaigns-manager";
import type { Campaign, CampaignActivity } from "../lib/campaigns-types";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

function access(...permissions: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: ["campaign.read", ...permissions].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

const ALL_WRITES = [
  "campaign.create",
  "campaign.update",
  "campaign.transition_status",
  "campaign.assign",
  "campaign.budget.read",
  "campaign.budget.update",
  "campaign.activity.manage",
  "campaign.delete",
];

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});

const AURORA = makeCampaign({
  id: "c1",
  name: "Aurora Awareness",
  status: "ACTIVE",
  progress: { completedActivities: 1, totalActivities: 4, percent: 25 },
});
const ORBIT = makeCampaign({
  id: "c2",
  name: "Orbit Launch",
  campaignType: "MARKETING",
  productName: "Orbit Speaker",
});

let listItems: Campaign[];
let listTotal: number;
let listFails: number;
let activities: CampaignActivity[];

/** The parts of a request the fake API reads. */
interface RequestOptions {
  params?: { query?: { page?: number }; path?: { id?: string } };
}

/** The query the campaigns list was last requested with. */
function lastListQuery(): Record<string, unknown> {
  const calls = get.mock.calls.filter(([path]) => path === "/api/v1/campaigns");
  return calls[calls.length - 1]![1].params.query;
}

function listCalls(): number {
  return get.mock.calls.filter(([path]) => path === "/api/v1/campaigns").length;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  put.mockReset();
  del.mockReset();
  listItems = [AURORA, ORBIT];
  listTotal = 2;
  listFails = 0;
  activities = [];

  get.mockImplementation(async (path: string, options?: RequestOptions) => {
    switch (path) {
      case "/api/v1/campaigns":
        if (listFails > 0) {
          listFails -= 1;
          return { data: undefined, response: { ok: false, status: 500 } };
        }
        return ok({
          items: listItems,
          page: options?.params?.query?.page ?? 1,
          pageSize: 10,
          total: listTotal,
        });
      case "/api/v1/campaigns/{id}":
        return ok(
          listItems.find((item) => item.id === options?.params?.path?.id) ??
            null,
        );
      case "/api/v1/campaigns/{id}/budget":
        return ok({ amount: "1000.00", currency: "USD" });
      case "/api/v1/campaigns/{id}/activities":
        return ok({
          items: activities,
          page: 1,
          pageSize: 100,
          total: activities.length,
        });
      case "/api/v1/users":
        return ok({
          items: [
            {
              id: "u1",
              email: "m@x.co",
              firstName: "Morgan",
              lastName: "Lead",
            },
          ],
        });
      case "/api/v1/teams":
        return ok({ items: [{ id: "t1", name: "Content Studio" }] });
      case "/api/v1/events":
        return ok({ items: [{ id: "e1", name: "Aurora Premiere" }] });
      default:
        return { data: undefined, response: { ok: false, status: 404 } };
    }
  });
});

function renderManager(current: CurrentAccess = access(...ALL_WRITES)) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <CampaignsManager access={current} />
    </QueryClientProvider>,
  );
  return { client, invalidate };
}

function rowButtons(name: string) {
  return screen.getAllByRole("button", { name });
}

async function openCampaign(name: string) {
  const user = userEvent.setup();
  await user.click((await screen.findAllByRole("button", { name }))[0]!);
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("heading", { name });
  return { user, dialog };
}

describe("CampaignsManager API integration", () => {
  describe("list", () => {
    it("announces loading, then shows the count and the campaigns the API returned", async () => {
      renderManager();

      expect(screen.getByText("Loading campaigns…")).toBeVisible();
      expect(await screen.findByText("2 campaigns")).toBeVisible();
      expect(rowButtons("Aurora Awareness").length).toBeGreaterThan(0);
      expect(rowButtons("Orbit Launch").length).toBeGreaterThan(0);
      expect(
        within(screen.getByRole("table")).getByRole("progressbar", {
          name: "Progress of Aurora Awareness",
        }),
      ).toHaveAttribute("aria-valuenow", "25");
    });

    it("requests the first page with the page size and no filters", async () => {
      renderManager();
      await screen.findByText("2 campaigns");

      expect(lastListQuery()).toEqual({ page: 1, pageSize: 10 });
    });

    it("shows a recoverable error and reloads on retry", async () => {
      const user = userEvent.setup();
      listFails = 1;
      renderManager();

      expect(
        await screen.findByText("We could not load the data. Try again."),
      ).toBeVisible();
      expect(screen.queryByText(/campaigns$/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("2 campaigns")).toBeVisible();
    });

    it("explains an empty list", async () => {
      listItems = [];
      listTotal = 0;
      renderManager();

      expect(await screen.findByText("0 campaigns")).toBeVisible();
      expect(screen.getByText("No campaigns yet")).toBeVisible();
    });

    it("re-checks access when the API answers 401 or 403", async () => {
      listFails = 1;
      get.mockImplementationOnce(async () => ({
        data: undefined,
        response: { ok: false, status: 403 },
      }));
      const { invalidate } = renderManager();

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: accessKey }),
      );
    });
  });

  describe("server-side filters and paging", () => {
    it("asks the API for the chosen status and type", async () => {
      const user = userEvent.setup();
      renderManager();
      await screen.findByText("2 campaigns");

      await user.click(
        screen.getByRole("combobox", { name: "Filter by status" }),
      );
      await user.click(await screen.findByRole("option", { name: "Active" }));
      await waitFor(() =>
        expect(lastListQuery()).toMatchObject({ status: "ACTIVE", page: 1 }),
      );

      await user.click(
        screen.getByRole("combobox", { name: "Filter by type" }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Promotion" }),
      );
      await waitFor(() =>
        expect(lastListQuery()).toMatchObject({
          status: "ACTIVE",
          campaignType: "PROMOTION",
        }),
      );
    });

    it("debounces the name search and sends the trimmed term", async () => {
      const user = userEvent.setup();
      renderManager();
      await screen.findByText("2 campaigns");
      const before = listCalls();

      await user.type(screen.getByLabelText("Search"), "  orbit ");

      await waitFor(() =>
        expect(lastListQuery()).toMatchObject({ search: "orbit" }),
      );
      // One request for the settled term, not one per keystroke.
      expect(listCalls() - before).toBeLessThanOrEqual(2);
      expect(screen.getByText(/matching campaign/)).toBeVisible();
    });

    it("pages with the API's total and returns to page one when a filter changes", async () => {
      const user = userEvent.setup();
      listTotal = 25;
      renderManager();

      expect(await screen.findByText("Page 1 of 3")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(lastListQuery()).toMatchObject({ page: 2 }));

      await user.click(
        screen.getByRole("combobox", { name: "Filter by status" }),
      );
      await user.click(await screen.findByRole("option", { name: "Planned" }));

      await waitFor(() =>
        expect(lastListQuery()).toMatchObject({ page: 1, status: "PLANNED" }),
      );
    });
  });

  describe("permissions", () => {
    it("hides the create action and skips assignment lookups for a read-only caller", async () => {
      renderManager(access());
      await screen.findByText("2 campaigns");

      expect(
        screen.queryByRole("button", { name: "New campaign" }),
      ).not.toBeInTheDocument();
      const paths = get.mock.calls.map(([path]) => path);
      expect(paths).not.toContain("/api/v1/users");
      expect(paths).not.toContain("/api/v1/teams");
    });

    it("loads users, teams, and events only for the abilities that need them", async () => {
      renderManager(access("campaign.assign"));
      await screen.findByText("2 campaigns");

      await waitFor(() => {
        const paths = get.mock.calls.map(([path]) => path);
        expect(paths).toContain("/api/v1/users");
        expect(paths).toContain("/api/v1/teams");
      });
    });

    it("shows the create action to a caller who may create", async () => {
      renderManager(access("campaign.create"));

      expect(
        await screen.findByRole("button", { name: "New campaign" }),
      ).toBeVisible();
    });
  });

  describe("creating", () => {
    it("posts the entered values, refetches the list, and announces success", async () => {
      const user = userEvent.setup();
      post.mockResolvedValue(
        ok(makeCampaign({ id: "c3", name: "Winter Push" }), 201),
      );
      renderManager();
      await screen.findByText("2 campaigns");
      const before = listCalls();

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Winter Push",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0]![0]).toBe("/api/v1/campaigns");
      expect(post.mock.calls[0]![1].body).toMatchObject({
        name: "Winter Push",
        campaignType: "MARKETING",
      });
      await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
      expect(await screen.findByText("Campaign created.")).toBeInTheDocument();
    });

    it("keeps the dialog and the typed values when the create fails", async () => {
      const user = userEvent.setup();
      post.mockResolvedValue({
        error: { code: "SOMETHING_NEW", status: 500 },
        response: { ok: false, status: 500 },
      });
      renderManager();
      await screen.findByText("2 campaigns");

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Will Not Save",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      expect(
        await screen.findByText("We could not create the campaign. Try again."),
      ).toBeVisible();
      expect(screen.getByLabelText("Name")).toHaveValue("Will Not Save");
      expect(screen.queryByText("Campaign created.")).not.toBeInTheDocument();
    });

    it("maps an API subject conflict to a message beside the form", async () => {
      const user = userEvent.setup();
      post.mockResolvedValue({
        error: { code: "CAMPAIGN_RELATED_SUBJECT_CONFLICT", status: 400 },
        response: { ok: false, status: 400 },
      });
      renderManager();
      await screen.findByText("2 campaigns");

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Both",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      expect(
        await screen.findByText(
          "Choose either an event or a product, not both.",
        ),
      ).toBeVisible();
    });

    it("refreshes the connected workspace cache alongside the campaigns", async () => {
      const user = userEvent.setup();
      post.mockResolvedValue(
        ok(makeCampaign({ id: "c3", name: "Cached" }), 201),
      );
      const { invalidate } = renderManager();
      await screen.findByText("2 campaigns");

      await user.click(screen.getByRole("button", { name: "New campaign" }));
      await user.type(
        within(await screen.findByRole("dialog")).getByLabelText("Name"),
        "Cached",
      );
      await user.click(screen.getByRole("button", { name: "Create campaign" }));

      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["campaigns", "operator-1"],
        });
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["workspaces", "operator-1"],
        });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: accessKey });
      });
    });
  });

  describe("detail", () => {
    it("loads the campaign, its budget, and its activities from the API", async () => {
      activities = [makeActivity({ id: "a1", name: "Teaser video" })];
      renderManager();
      await openCampaign("Aurora Awareness");

      expect(await screen.findByText("Teaser video")).toBeVisible();
      expect(screen.getByText("Current: 1000.00 USD")).toBeVisible();
      const paths = get.mock.calls.map(([path]) => path);
      expect(paths).toContain("/api/v1/campaigns/{id}");
      expect(paths).toContain("/api/v1/campaigns/{id}/budget");
      expect(paths).toContain("/api/v1/campaigns/{id}/activities");
    });

    it("does not request the budget for a caller without budget access", async () => {
      renderManager(access("campaign.update"));
      await openCampaign("Aurora Awareness");

      expect(get.mock.calls.map(([path]) => path)).not.toContain(
        "/api/v1/campaigns/{id}/budget",
      );
      expect(
        screen.getByText("You do not have permission to view the budget."),
      ).toBeVisible();
    });

    it("shows read-only details, lifecycle, and activities without write grants", async () => {
      activities = [makeActivity({ id: "a1", name: "Teaser video" })];
      renderManager(access());
      const { dialog } = await openCampaign("Aurora Awareness");

      expect(
        within(dialog).getByText(/read-only access to this campaign/),
      ).toBeVisible();
      expect(within(dialog).getByText("Current status: Active.")).toBeVisible();
      await within(dialog).findByText("Teaser video");
      expect(
        within(dialog).queryByRole("button", { name: "Add activity" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Delete campaign" }),
      ).not.toBeInTheDocument();
    });

    it("creates an activity through the API and refreshes the list's progress", async () => {
      const user = userEvent.setup();
      post.mockResolvedValue(
        ok(
          makeActivity({ id: "a9", campaignId: "c1", name: "Billboards" }),
          201,
        ),
      );
      renderManager();
      const { dialog } = await openCampaign("Aurora Awareness");
      await within(dialog).findByText(/No activities yet/);
      const before = listCalls();

      await user.click(
        within(dialog).getByRole("button", { name: "Add activity" }),
      );
      await user.type(
        within(dialog).getByLabelText("Activity name"),
        "Billboards",
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Add activity" }),
      );

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/activities");
      expect(post.mock.calls[0]![1].params.path).toEqual({ id: "c1" });
      expect(post.mock.calls[0]![1].body).toMatchObject({
        name: "Billboards",
        status: "PLANNED",
      });
      expect(await within(dialog).findByText("Billboards")).toBeVisible();
      await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    });

    it("moves a campaign through a lifecycle transition and refreshes the list", async () => {
      const user = userEvent.setup();
      put.mockReset();
      post.mockResolvedValue(ok({ ...ORBIT, status: "ACTIVE" }));
      renderManager();
      const { dialog } = await openCampaign("Orbit Launch");
      const before = listCalls();

      await user.click(
        within(dialog).getByRole("combobox", { name: "Move to" }),
      );
      await user.click(await screen.findByRole("option", { name: "Active" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/transition");
      expect(post.mock.calls[0]![1].body).toEqual({ status: "ACTIVE" });
      await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    });

    it("deletes through the API, closes the dialog, and refreshes the list", async () => {
      const user = userEvent.setup();
      del.mockResolvedValue({ response: { ok: true, status: 204 } });
      renderManager();
      const { dialog } = await openCampaign("Orbit Launch");
      const before = listCalls();

      await user.click(
        within(dialog).getByRole("button", { name: "Delete campaign" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Confirm delete" }),
      );

      await waitFor(() =>
        expect(del).toHaveBeenCalledWith(
          "/api/v1/campaigns/{id}",
          expect.objectContaining({ params: { path: { id: "c2" } } }),
        ),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Campaign deleted.")).toBeInTheDocument();
      expect(listCalls()).toBeGreaterThan(before);
    });

    it("keeps the dialog and explains when the API refuses the delete", async () => {
      const user = userEvent.setup();
      del.mockResolvedValue({
        error: { code: "CAMPAIGN_HAS_MANAGED_FILES", status: 409 },
        response: { ok: false, status: 409 },
      });
      renderManager();
      const { dialog } = await openCampaign("Orbit Launch");

      await user.click(
        within(dialog).getByRole("button", { name: "Delete campaign" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Confirm delete" }),
      );

      expect(
        await within(dialog).findByText(/has attached files/),
      ).toBeVisible();
      expect(screen.getByRole("dialog")).toBeVisible();
    });

    it("shows the error state when the campaign cannot be loaded", async () => {
      const user = userEvent.setup();
      renderManager();
      await screen.findByText("2 campaigns");
      listItems = [];

      await user.click(rowButtons("Aurora Awareness")[0]!);

      expect(
        await screen.findByText("We could not load this campaign"),
      ).toBeVisible();
    });
  });
});
