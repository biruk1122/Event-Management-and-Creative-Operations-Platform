import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CampaignMetric } from "../api/campaign-detail-gateway";

import {
  CampaignMetricsPanel,
  metricFieldError,
} from "./campaign-metrics-panel";

const metric: CampaignMetric = {
  id: "m1",
  campaignId: "cmp-1",
  key: "TICKETS_SOLD",
  value: "1200.00",
  recordedOn: "2026-11-01",
  sourceNote: "Box office export",
  recordedBy: {
    id: "u1",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
  createdAt: "2026-11-01T10:00:00.000Z",
};

describe("metricFieldError", () => {
  it("accepts a figure from zero with up to two decimals on a real day", () => {
    expect(metricFieldError({ value: "0", recordedOn: "2026-11-01" })).toEqual(
      {},
    );
    expect(
      metricFieldError({ value: "12500.5", recordedOn: "2026-11-01" }),
    ).toEqual({});
  });

  it("refuses a missing, negative, over-precise or non-numeric figure", () => {
    expect(
      metricFieldError({ value: "", recordedOn: "2026-11-01" }).value,
    ).toBeDefined();
    expect(
      metricFieldError({ value: "-1", recordedOn: "2026-11-01" }).value,
    ).toBeDefined();
    expect(
      metricFieldError({ value: "1.234", recordedOn: "2026-11-01" }).value,
    ).toBe("Use at most two decimal places.");
    expect(
      metricFieldError({ value: "many", recordedOn: "2026-11-01" }).value,
    ).toBeDefined();
  });

  it("refuses a day that does not exist", () => {
    expect(
      metricFieldError({ value: "1", recordedOn: "2026-02-30" }).recordedOn,
    ).toBe("Choose a real calendar day.");
    expect(
      metricFieldError({ value: "1", recordedOn: "" }).recordedOn,
    ).toBeDefined();
  });
});

describe("CampaignMetricsPanel", () => {
  it("shows recorded figures exactly as they were recorded", async () => {
    render(
      <CampaignMetricsPanel
        campaignId="cmp-1"
        canWrite={false}
        list={() => Promise.resolve([metric])}
        record={vi.fn()}
      />,
    );
    expect(await screen.findByText("1200.00")).toBeInTheDocument();
    expect(screen.getByText("Tickets sold")).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Record a metric" }),
    ).not.toBeInTheDocument();
  });

  it("records a figure and adds it to the top of the list", async () => {
    const user = userEvent.setup();
    const record = vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        value: { ...metric, id: "m2", value: "50.00" },
      }),
    );
    render(
      <CampaignMetricsPanel
        campaignId="cmp-1"
        canWrite
        list={() => Promise.resolve([])}
        record={record}
      />,
    );
    await screen.findByText("No metrics recorded yet.");
    await user.type(screen.getByLabelText("Value"), "50");
    await user.type(screen.getByLabelText("Recorded on"), "2026-11-02");
    await user.click(screen.getByRole("button", { name: "Record metric" }));

    await waitFor(() =>
      expect(record).toHaveBeenCalledWith("cmp-1", {
        key: "REACH",
        value: 50,
        recordedOn: "2026-11-02",
        sourceNote: null,
      }),
    );
    expect(await screen.findByText("50.00")).toBeInTheDocument();
  });

  it("does not send an invalid figure", async () => {
    const user = userEvent.setup();
    const record = vi.fn();
    render(
      <CampaignMetricsPanel
        campaignId="cmp-1"
        canWrite
        list={() => Promise.resolve([])}
        record={record}
      />,
    );
    await screen.findByText("No metrics recorded yet.");
    await user.type(screen.getByLabelText("Value"), "-4");
    await user.type(screen.getByLabelText("Recorded on"), "2026-11-02");
    await user.click(screen.getByRole("button", { name: "Record metric" }));
    expect(
      await screen.findByText("Enter a figure from 0 up."),
    ).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });
});
