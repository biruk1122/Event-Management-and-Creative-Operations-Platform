import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { REALTIME_FIXTURES } from "../lib/realtime-fixtures";
import type { RealtimeConnectionState } from "../lib/realtime-types";
import { RealtimeStatusPanel } from "./realtime-status-panel";

function connectOnce(state: RealtimeConnectionState) {
  return vi.fn((): Promise<RealtimeConnectionState> => Promise.resolve(state));
}

function setup(connect: () => Promise<RealtimeConnectionState>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RealtimeStatusPanel connect={connect} />
    </QueryClientProvider>,
  );
}

describe("RealtimeStatusPanel", () => {
  it("shows the connecting state before the handshake resolves", () => {
    setup(() => new Promise(() => undefined));
    // Once for the visible copy, once for the sr-only live region.
    expect(screen.getAllByText("Connecting to live updates…")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to live updates…",
    );
  });

  it("shows an empty state once connected with no joined rooms", async () => {
    setup(connectOnce(REALTIME_FIXTURES.connectedEmpty));
    expect(
      await screen.findByText("Connected. No live rooms yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("lists joined rooms once connected", async () => {
    setup(connectOnce(REALTIME_FIXTURES.connectedWithRooms));
    for (const room of REALTIME_FIXTURES.connectedWithRooms.rooms) {
      expect(await screen.findByText(room.label)).toBeInTheDocument();
    }
  });

  it("shows reconnecting rooms while the connection is being restored", async () => {
    setup(connectOnce(REALTIME_FIXTURES.reconnecting));
    for (const room of REALTIME_FIXTURES.reconnecting.rooms) {
      expect(await screen.findByText(room.label)).toBeInTheDocument();
    }
  });

  it("shows a disabled state with no retry action", async () => {
    setup(connectOnce(REALTIME_FIXTURES.disabled));
    expect(
      await screen.findByText("Live updates are turned off for this session."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("shows the denial reason and recovers on retry", async () => {
    const user = userEvent.setup();
    const connect = vi
      .fn()
      .mockResolvedValueOnce(REALTIME_FIXTURES.denied)
      .mockResolvedValueOnce(REALTIME_FIXTURES.connectedEmpty);

    setup(connect);

    expect(
      await screen.findByText(REALTIME_FIXTURES.denied.detail!),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry/i });
    await user.click(retryButton);

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Connected. No live rooms yet."),
    ).toBeInTheDocument();
  });

  it("shows a connection error and recovers on retry", async () => {
    const user = userEvent.setup();
    const connect = vi
      .fn()
      .mockResolvedValueOnce(REALTIME_FIXTURES.error)
      .mockResolvedValueOnce(REALTIME_FIXTURES.connectedEmpty);

    setup(connect);

    expect(
      await screen.findByText(REALTIME_FIXTURES.error.detail!),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Connected. No live rooms yet."),
    ).toBeInTheDocument();
  });

  it("treats a rejected handshake the same as an error state", async () => {
    setup(() => Promise.reject(new Error("network")));
    expect(
      await screen.findByText("We could not reach the live updates service."),
    ).toBeInTheDocument();
  });

  it("stacks the header on narrow layouts and aligns it inline from the sm breakpoint up", async () => {
    const { container } = setup(connectOnce(REALTIME_FIXTURES.connectedEmpty));
    await screen.findByText("Connected. No live rooms yet.");
    const header = container.querySelector("h2")?.parentElement;
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
  });
});
