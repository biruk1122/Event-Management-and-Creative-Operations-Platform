"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { accessKey } from "@/features/auth/api/access-queries";

import { connectRealtime as defaultConnectRealtime } from "./connect-realtime";
import type {
  ConnectRealtime,
  RealtimeConnectionState,
} from "../lib/realtime-types";

const CONNECTING_STATE: RealtimeConnectionState = {
  status: "connecting",
  detail: null,
  rooms: [],
};

export interface RealtimeConnection {
  state: RealtimeConnectionState;
  /** True while a manually triggered `retry()` is in flight. */
  retrying: boolean;
  retry: () => void;
}

/**
 * Owns the `/realtime` connection lifecycle for one mounted consumer and
 * reconciles durable state through REST on every reconnect after the first
 * (ADR 0004: REST is always authoritative, a socket is never the source of
 * truth). Reconciling `accessKey` specifically because a permission or
 * session change made while disconnected is exactly what a stale connection
 * would otherwise miss - the same "re-check access after something
 * uncertain happened" reasoning `useWorkspacesMutations` already applies
 * after REST writes.
 */
export function useRealtimeConnection(
  connect: ConnectRealtime = defaultConnectRealtime,
): RealtimeConnection {
  const client = useQueryClient();
  const [state, setState] = useState<RealtimeConnectionState>(CONNECTING_STATE);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const everConnectedRef = useRef(false);

  useEffect(() => {
    // Deliberately not reset per attempt: a manual retry commonly follows
    // exactly the kind of "something uncertain happened" event (a session
    // that needed re-authenticating, a network drop) the reconciliation
    // policy exists for, so a connect that succeeds after a retry reconciles
    // the same as a connect that succeeds after an automatic reconnect.
    // Only the very first connect of this hook's lifetime is exempt, since
    // nothing has been cached yet that could have gone stale.
    const close = connect((next) => {
      if (next.status === "connected") {
        if (everConnectedRef.current) {
          void client.invalidateQueries({ queryKey: accessKey });
        }
        everConnectedRef.current = true;
      }
      setState(next);
      setRetrying(false);
    });
    return close;
    // `attempt` is not read in the body; bumping it in `retry()` below is
    // what forces this effect to close the old connection and open a fresh
    // one.
  }, [connect, client, attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setState(CONNECTING_STATE);
    setAttempt((count) => count + 1);
  }, []);

  return { state, retrying, retry };
}
