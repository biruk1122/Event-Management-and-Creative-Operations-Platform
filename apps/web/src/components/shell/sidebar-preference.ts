"use client";
import { useSyncExternalStore } from "react";
const EVENT = "lela-sidebar-preference";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
/** Browser-local, account-keyed presentation choice, not a new persistence API. */
export function useSidebarPreference(userId: string) {
  const key = `lela:sidebar:${userId}`;
  const collapsed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "collapsed";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(key, collapsed ? "expanded" : "collapsed");
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* Storage is optional; the expanded sidebar remains usable. */
    }
  };
  return { collapsed, toggle };
}
