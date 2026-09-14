import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `access-queries.ts` imports the real `browserApi`, and `connect-realtime.ts`
// (the hook's default seam) reads `clientEnvironment` directly - both
// undefined in this test process. Every test here injects its own `connect`,
// so neither the real gateway nor the real seam is ever needed.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

import { accessKey } from "@/features/auth/api/access-queries";

import { useRealtimeConnection } from "./realtime-queries";
import type {
  ConnectRealtime,
  RealtimeConnectionListener,
  RealtimeConnectionState,
} from "../lib/realtime-types";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** A controllable fake `ConnectRealtime`: the test drives every emission. */
function fakeConnect() {
  const listeners: RealtimeConnectionListener[] = [];
  const closes: number[] = [];
  let openCalls = 0;
  const connect: ConnectRealtime = (listener) => {
    openCalls += 1;
    listeners.push(listener);
    const index = listeners.length - 1;
    return () => {
      closes.push(index);
    };
  };
  return {
    connect,
    emit: (state: RealtimeConnectionState) => {
      const current = listeners[listeners.length - 1];
      current?.(state);
    },
    get openCalls() {
      return openCalls;
    },
    get closedCount() {
      return closes.length;
    },
  };
}

describe("useRealtimeConnection", () => {
  it("starts connecting and does not reconcile on the first successful connect", async () => {
    const client = makeClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const fake = fakeConnect();

    const { result } = renderHook(() => useRealtimeConnection(fake.connect), {
      wrapper: wrapper(client),
    });

    expect(result.current.state.status).toBe("connecting");

    act(() => {
      fake.emit({ status: "connected", detail: null, rooms: [] });
    });

    await waitFor(() => expect(result.current.state.status).toBe("connected"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("reconciles the access cache once a reconnect after a drop succeeds", async () => {
    const client = makeClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const fake = fakeConnect();

    const { result } = renderHook(() => useRealtimeConnection(fake.connect), {
      wrapper: wrapper(client),
    });

    act(() => fake.emit({ status: "connected", detail: null, rooms: [] }));
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    act(() => fake.emit({ status: "reconnecting", detail: null, rooms: [] }));
    await waitFor(() =>
      expect(result.current.state.status).toBe("reconnecting"),
    );
    expect(spy).not.toHaveBeenCalled();

    act(() => fake.emit({ status: "connected", detail: null, rooms: [] }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: accessKey }),
    );
  });

  it("tears down the old connection and opens a fresh one on retry", async () => {
    const client = makeClient();
    const fake = fakeConnect();

    const { result } = renderHook(() => useRealtimeConnection(fake.connect), {
      wrapper: wrapper(client),
    });

    act(() =>
      fake.emit({
        status: "denied",
        detail: "Sign in again.",
        rooms: [],
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("denied"));
    expect(fake.openCalls).toBe(1);

    act(() => result.current.retry());

    expect(result.current.state.status).toBe("connecting");
    expect(result.current.retrying).toBe(true);
    await waitFor(() => expect(fake.closedCount).toBe(1));
    await waitFor(() => expect(fake.openCalls).toBe(2));

    act(() => fake.emit({ status: "connected", detail: null, rooms: [] }));
    await waitFor(() => expect(result.current.state.status).toBe("connected"));
    expect(result.current.retrying).toBe(false);
  });

  it("closes the connection on unmount", () => {
    const client = makeClient();
    const fake = fakeConnect();

    const { unmount } = renderHook(() => useRealtimeConnection(fake.connect), {
      wrapper: wrapper(client),
    });

    expect(fake.closedCount).toBe(0);
    unmount();
    expect(fake.closedCount).toBe(1);
  });
});
