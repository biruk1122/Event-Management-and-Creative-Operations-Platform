import { afterEach, describe, expect, it, vi } from "vitest";

import type { RealtimeConnectionState } from "../lib/realtime-types";

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  readonly listeners = new Map<string, Set<Handler>>();
  connectCalls = 0;
  disconnectCalls = 0;

  on(event: string, handler: Handler): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return this;
  }

  connect(): this {
    this.connectCalls += 1;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls += 1;
    return this;
  }

  trigger(event: string, ...args: unknown[]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: ioMock }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

import { connectRealtime } from "./connect-realtime";

function open() {
  const socket = new FakeSocket();
  ioMock.mockReturnValueOnce(socket);
  const states: RealtimeConnectionState[] = [];
  const close = connectRealtime((state) => states.push(state));
  return { socket, states, close };
}

afterEach(() => {
  ioMock.mockReset();
});

describe("connectRealtime", () => {
  it("opens the /realtime namespace with credentials", () => {
    open();
    expect(ioMock).toHaveBeenCalledWith("http://localhost:4000/realtime", {
      withCredentials: true,
    });
  });

  it("reports connected once the handshake succeeds", () => {
    const { socket, states } = open();
    socket.trigger("connect");
    expect(states).toEqual([{ status: "connected", detail: null, rooms: [] }]);
  });

  it("reports denied and stops the socket when the handshake is unauthenticated", () => {
    const { socket, states } = open();
    socket.trigger("connect_error", new Error("unauthenticated"));
    expect(states).toEqual([
      {
        status: "denied",
        detail:
          "Your session could not be used for live updates. Sign in again to restore them.",
        rooms: [],
      },
    ]);
    expect(socket.disconnectCalls).toBe(1);
  });

  it("reports a generic error for any other connect failure, without disconnecting", () => {
    const { socket, states } = open();
    socket.trigger("connect_error", new Error("xhr poll error"));
    expect(states).toEqual([
      {
        status: "error",
        detail: "We could not reach the live updates service.",
        rooms: [],
      },
    ]);
    expect(socket.disconnectCalls).toBe(0);
  });

  it("ignores a disconnect caused by its own teardown", () => {
    const { socket, states } = open();
    socket.trigger("connect");
    socket.trigger("disconnect", "io client disconnect");
    expect(states).toEqual([{ status: "connected", detail: null, rooms: [] }]);
  });

  it("reports reconnecting for a dropped connection", () => {
    const { socket, states } = open();
    socket.trigger("connect");
    socket.trigger("disconnect", "transport close");
    expect(states[1]).toEqual({
      status: "reconnecting",
      detail: null,
      rooms: [],
    });
    // socket.io auto-reconnects on its own for this reason; no manual nudge.
    expect(socket.connectCalls).toBe(0);
  });

  it("manually resumes after a server-initiated disconnect", () => {
    const { socket, states } = open();
    socket.trigger("connect");
    socket.trigger("disconnect", "io server disconnect");
    expect(states[1]).toEqual({
      status: "reconnecting",
      detail: null,
      rooms: [],
    });
    // socket.io does not auto-reconnect after this reason on its own.
    expect(socket.connectCalls).toBe(1);
  });

  it("stops reporting state once closed", () => {
    const { socket, states, close } = open();
    close();
    expect(socket.disconnectCalls).toBe(1);
    socket.trigger("connect");
    socket.trigger("connect_error", new Error("network"));
    expect(states).toEqual([]);
  });
});
