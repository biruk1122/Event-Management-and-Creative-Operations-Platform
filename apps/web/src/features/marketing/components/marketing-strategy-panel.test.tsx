import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { makeCampaign } from "@/features/campaigns/test-data";

const { get, create, update, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../api/marketing-gateway", () => ({
  getMarketingStrategy: get,
  createMarketingStrategy: create,
  updateMarketingStrategy: update,
  removeMarketingStrategy: remove,
  MarketingRequestError: class MarketingRequestError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "MarketingRequestError";
    }
  },
}));

import { MarketingRequestError } from "../api/marketing-gateway";
import { MarketingStrategyPanel } from "./marketing-strategy-panel";

const campaign = makeCampaign({
  campaignType: "MARKETING",
  name: "Community launch",
});
const strategy = {
  campaignId: campaign.id,
  strategy: "Partner outreach",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
function access(...keys: string[]): CurrentAccess {
  return {
    userId: "operator-1",
    grants: keys.map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

function setup(current = access("campaign.read", "campaign.update")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MarketingStrategyPanel campaign={campaign} access={current} />
    </QueryClientProvider>,
  );
  return { client, invalidate };
}

beforeEach(() => {
  get.mockReset();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
});

describe("MarketingStrategyPanel", () => {
  it("loads the empty state, creates with real data, then edits and removes", async () => {
    const user = userEvent.setup();
    let current: typeof strategy | null = null;
    get.mockImplementation(async () => current);
    create.mockImplementation(async (_id: string, text: string) => {
      current = { ...strategy, strategy: text };
      return current;
    });
    update.mockImplementation(async (_id: string, text: string) => {
      current = { ...strategy, strategy: text };
      return current;
    });
    remove.mockImplementation(async () => {
      current = null;
    });
    const { invalidate } = setup();
    expect(await screen.findByText("No strategy yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add strategy" }));
    await user.type(
      screen.getByRole("textbox", { name: "Strategy" }),
      "Local partners",
    );
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(campaign.id, "Local partners"),
    );
    expect(await screen.findByText("Local partners")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit strategy" }));
    await user.clear(screen.getByRole("textbox", { name: "Strategy" }));
    await user.type(
      screen.getByRole("textbox", { name: "Strategy" }),
      "New approach",
    );
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(campaign.id, "New approach"),
    );
    expect(await screen.findByText("New approach")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove strategy" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(campaign.id));
    expect(await screen.findByText("No strategy yet")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["campaigns", "operator-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["workspaces", "operator-1"],
    });
  });

  it("preserves the draft and shows the mapped error after a recoverable failure", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(null);
    create.mockRejectedValue(
      new MarketingRequestError(
        409,
        "MARKETING_STRATEGY_CONFLICT",
        "A strategy was added elsewhere.",
      ),
    );
    setup();
    await screen.findByText("No strategy yet");
    await user.click(screen.getByRole("button", { name: "Add strategy" }));
    await user.type(
      screen.getByRole("textbox", { name: "Strategy" }),
      "Keep this draft",
    );
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "added elsewhere",
    );
    expect(screen.getByRole("textbox", { name: "Strategy" })).toHaveValue(
      "Keep this draft",
    );
  });

  it("shows read-only and denied states without offering mutations", async () => {
    get.mockResolvedValue(strategy);
    setup(access("campaign.read"));
    expect(await screen.findByText("Partner outreach")).toBeVisible();
    expect(screen.getByText(/Read-only access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit strategy" })).toBeNull();
  });

  it("rechecks access when the API revokes campaign read permission", async () => {
    get.mockRejectedValue(
      new MarketingRequestError(403, "PERMISSION_DENIED", "Denied"),
    );
    const { invalidate } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have access",
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessKey });
  });
});
