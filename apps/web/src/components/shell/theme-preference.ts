"use client";
import { useSyncExternalStore } from "react";
const KEY = "lela:theme";
const EVENT = "lela-theme-preference";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function isDark(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    /* Storage is optional; fall through to the system preference. */
  }
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Browser-local presentation choice, applied to <html> by the blocking
 * inline script in the root layout (avoiding a light-mode flash) and kept
 * in sync here, matching useSidebarPreference's own persistence pattern. */
export function useThemePreference() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* Storage is optional; the toggled class remains in effect. */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return { dark, toggle };
}
