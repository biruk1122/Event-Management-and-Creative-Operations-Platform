import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { makeActivity } from "@/features/campaigns/test-data";
import type { PromotionActivity } from "../promotion-types";
import { PromotionOperationsPanel } from "./promotion-operations-panel";

vi.mock("@/features/auth/api/access-queries", () => ({
  accessKey: ["auth", "access"],
}));
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

const { listShared, listPromotion, listTalents, attach } = vi.hoisted(() => ({
  listShared: vi.fn(),
  listPromotion: vi.fn(),
  listTalents: vi.fn(),
  attach: vi.fn(),
}));
vi.mock("../api/promotion-gateway", () => ({
  PromotionRequestError: class extends Error {
    constructor(readonly status: number) {
      super("Failed");
    }
  },
  listSharedActivities: listShared,
  listPromotionActivities: listPromotion,
  listPromotionTalents: listTalents,
  attachPromotion: attach,
}));

const activity = makeActivity({ id: "activity-1", name: "Launch teaser" });
const detail: PromotionActivity = {
  activity,
  channel: "SOCIAL_MEDIA",
  talents: [],
};

function access(...keys: string[]): CurrentAccess {
  return {
    userId: "user-1",
    grants: keys.map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

function setup(grants = access("campaign.read", "campaign.activity.manage")) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <PromotionOperationsPanel
          campaignId="campaign-1"
          campaignName="Launch"
          access={grants}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  listShared.mockReset().mockResolvedValue([activity]);
  listPromotion.mockReset().mockResolvedValue([]);
  listTalents.mockReset().mockResolvedValue([]);
  attach.mockReset().mockResolvedValue(detail);
});

describe("PromotionOperationsPanel", () => {
  it("uses live data and refreshes the scoped cache after a mutation", async () => {
    listPromotion.mockResolvedValueOnce([]).mockResolvedValue([detail]);
    setup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Launch teaser/ }),
    );
    await user.selectOptions(
      screen.getByLabelText("Delivery channel"),
      "SOCIAL_MEDIA",
    );
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    await waitFor(() =>
      expect(attach).toHaveBeenCalledWith(
        "campaign-1",
        "activity-1",
        "SOCIAL_MEDIA",
      ),
    );
    await waitFor(() =>
      expect(listPromotion.mock.calls.length).toBeGreaterThan(1),
    );
    expect(
      await screen.findByRole("button", { name: /Social media/ }),
    ).toBeInTheDocument();
  });

  it("does not query or expose actions without the campaign read grant", () => {
    setup(access());
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    expect(listShared).not.toHaveBeenCalled();
    expect(listPromotion).not.toHaveBeenCalled();
  });

  it("does not fetch talent choices without talent.read", async () => {
    setup(access("campaign.read", "campaign.activity.manage", "talent.assign"));
    await screen.findByRole("button", { name: /Launch teaser/ });
    expect(listTalents).not.toHaveBeenCalled();
  });

  it("recovers from a read failure without inventing empty data", async () => {
    listPromotion
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([]);
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Launch teaser/ }),
    ).toBeInTheDocument();
  });

  it("preserves a channel choice after a failed write so it can be retried", async () => {
    attach
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(detail);
    setup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Launch teaser/ }),
    );
    await user.selectOptions(
      screen.getByLabelText("Delivery channel"),
      "SOCIAL_MEDIA",
    );
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByLabelText("Delivery channel")).toHaveValue(
      "SOCIAL_MEDIA",
    );
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
  });
});
