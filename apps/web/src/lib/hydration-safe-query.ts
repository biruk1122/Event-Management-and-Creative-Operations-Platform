"use client";

import { useSyncExternalStore } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

const subscribe = () => () => undefined;

/** `false` during server render and the hydration pass, `true` afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Client chunks can arrive in any order on slow networks, so a component may
 * hydrate after a shared query (access, current user) has already resolved.
 * Its first client render would then differ from the server HTML (which is
 * always the pending state) and React discards and rebuilds the whole tree
 * (error #418). Reporting the pending state until hydration finishes keeps
 * the first render identical to the server's; the real result follows
 * immediately in the next render.
 */
export function hydrationSafe<T extends UseQueryResult<unknown, unknown>>(
  result: T,
  hydrated: boolean,
): T {
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    error: null,
    status: "pending",
    fetchStatus: "idle",
    isPending: true,
    isLoading: false,
    isFetching: false,
    isSuccess: false,
    isError: false,
    isRefetching: false,
  } as unknown as T;
}
