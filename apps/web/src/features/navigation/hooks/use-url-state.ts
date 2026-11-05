"use client";

import type { Route } from "next";
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { UrlCodec } from "../lib/url-state";

// Several controls can change in one event (a filter change also resets the
// page). Their query updates are gathered here and written with one replace,
// so the last writer does not drop the others.
let pending: URLSearchParams | null = null;
let scheduled = false;

/**
 * A list control whose value lives in the URL, so returning from a record
 * restores it. The value is read once on mount: a list remounts when the user
 * comes back, so the URL at that moment is the state to restore.
 */
export function useUrlState<T>(
  key: string,
  fallback: T,
  codec: UrlCodec<T>,
  initialRaw: string | null,
): [T, (next: T | ((current: T) => T)) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState<T>(() =>
    codec.parse(initialRaw, fallback),
  );

  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved =
          typeof next === "function"
            ? (next as (current: T) => T)(current)
            : next;
        if (!pending) pending = new URLSearchParams(window.location.search);
        const raw = codec.serialize(resolved, fallback);
        if (raw === null) pending.delete(key);
        else pending.set(key, raw);
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => {
            const query = pending?.toString() ?? "";
            pending = null;
            scheduled = false;
            router.replace(
              (query ? `${pathname}?${query}` : pathname) as Route,
              {
                scroll: false,
              },
            );
          });
        }
        return resolved;
      });
    },
    [codec, fallback, key, pathname, router],
  );

  return [value, update];
}
