import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// `useRealtimeConnection` imports `access-queries.ts` (real `browserApi`)
// and its own default seam `connect-realtime.ts` (real `clientEnvironment`)
// - both undefined in this test process. Every test here injects its own
// `connect`, so neither is ever actually needed.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

import { REALTIME_FIXTURES } from "../lib/realtime-fixtures";
import type {
  ConnectRealtime,
  RealtimeConnectionState,
} from "../lib/realtime-types";
import { RealtimeStatusPanel } from "./realtime-status-panel";

/**
 * Emits the next state in `states` (repeating the last one) every time the
 * panel opens a connection - once on mount, and again on every retry.
 */
function scriptedConnect(
  ...states: RealtimeConnectionState[]
): ConnectRealtime {
  let index = 0;
  return (listener) => {
    const state = states[Math.min(index, states.length - 1)]!;
    index += 1;
    listener(state);
    return () => undefined;
  };
}

function setup(connect: ConnectRealtime) {
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
    setup(() => () => undefined);
    // Once for the visible copy, once for the sr-only live region.
    expect(screen.getAllByText("Connecting to live updates…")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to live updates…",
    );
  });

  it("shows an empty state once connected with no joined rooms", () => {
    setup(scriptedConnect(REALTIME_FIXTURES.connectedEmpty));
    expect(
      screen.getByText("Connected. No live rooms yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("lists joined rooms once connected", () => {
    setup(scriptedConnect(REALTIME_FIXTURES.connectedWithRooms));
    for (const room of REALTIME_FIXTURES.connectedWithRooms.rooms) {
      expect(screen.getByText(room.label)).toBeInTheDocument();
    }
  });

  it("shows reconnecting rooms while the connection is being restored", () => {
    setup(scriptedConnect(REALTIME_FIXTURES.reconnecting));
    for (const room of REALTIME_FIXTURES.reconnecting.rooms) {
      expect(screen.getByText(room.label)).toBeInTheDocument();
    }
  });

  it("shows a disabled state with no retry action", () => {
    setup(scriptedConnect(REALTIME_FIXTURES.disabled));
    expect(
      screen.getByText("Live updates are turned off for this session."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("shows the denial reason and recovers on retry", async () => {
    const user = userEvent.setup();
    setup(
      scriptedConnect(
        REALTIME_FIXTURES.denied,
        REALTIME_FIXTURES.connectedEmpty,
      ),
    );

    expect(
      screen.getByText(REALTIME_FIXTURES.denied.detail!),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(
        screen.getByText("Connected. No live rooms yet."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a connection error and recovers on retry", async () => {
    const user = userEvent.setup();
    setup(
      scriptedConnect(
        REALTIME_FIXTURES.error,
        REALTIME_FIXTURES.connectedEmpty,
      ),
    );

    expect(
      screen.getByText(REALTIME_FIXTURES.error.detail!),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(
        screen.getByText("Connected. No live rooms yet."),
      ).toBeInTheDocument(),
    );
  });

  it("stacks the header on narrow layouts and aligns it inline from the sm breakpoint up", () => {
    const { container } = setup(
      scriptedConnect(REALTIME_FIXTURES.connectedEmpty),
    );
    screen.getByText("Connected. No live rooms yet.");
    const header = container.querySelector("h2")?.parentElement;
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
  });
});
