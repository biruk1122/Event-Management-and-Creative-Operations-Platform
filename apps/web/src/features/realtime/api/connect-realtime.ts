"use client";

import { io, type Socket } from "socket.io-client";

import { clientEnvironment } from "@/env/client";

import type { ConnectRealtime } from "../lib/realtime-types";

/**
 * The exact message the `/realtime` gateway's handshake middleware sends for
 * every refusal reason - missing cookie, invalid or expired token, or an
 * inactive session (`apps/api/src/realtime/realtime.gateway.ts`). It is the
 * only signal the client gets to distinguish "this needs a sign-in", which
 * retrying cannot fix, from a transient network or server failure, which it
 * can.
 */
const UNAUTHENTICATED = "unauthenticated";

/**
 * Opens the real `/realtime` handshake (ADR 0004 §1) using the same HttpOnly
 * session cookie REST uses. Replaces the fixture-backed seam RTC-04
 * (EVE-102) shipped; `useRealtimeConnection` (`./realtime-queries.ts`) is the
 * only intended caller.
 */
export const connectRealtime: ConnectRealtime = (listener, onFrame) => {
  const socket: Socket = io(
    `${clientEnvironment.NEXT_PUBLIC_WS_URL}/realtime`,
    { withCredentials: true },
  );

  let torndown = false;

  if (onFrame) {
    // Every server-to-client frame (ADR 0004 §2), forwarded as-is; the
    // caller matches on its own event name (e.g. `notification.invalidated`).
    socket.onAny((event: string, payload: unknown) => {
      if (torndown) return;
      onFrame(event, payload);
    });
  }

  socket.on("connect", () => {
    if (torndown) return;
    listener({ status: "connected", detail: null, rooms: [] });
  });

  socket.on("disconnect", (reason: Socket.DisconnectReason) => {
    if (torndown || reason === "io client disconnect") return;
    listener({ status: "reconnecting", detail: null, rooms: [] });
    // Every other reason auto-reconnects on its own; a server-initiated
    // disconnect does not, and needs an explicit call to resume.
    if (reason === "io server disconnect") {
      socket.connect();
    }
  });

  socket.on("connect_error", (error: Error) => {
    if (torndown) return;
    if (error.message === UNAUTHENTICATED) {
      // Retrying without a valid session cannot succeed; stop the client's
      // own automatic reconnection loop instead of letting it spin forever.
      socket.disconnect();
      listener({
        status: "denied",
        detail:
          "Your session could not be used for live updates. Sign in again to restore them.",
        rooms: [],
      });
      return;
    }
    listener({
      status: "error",
      detail: "We could not reach the live updates service.",
      rooms: [],
    });
  });

  return () => {
    torndown = true;
    socket.disconnect();
  };
};
