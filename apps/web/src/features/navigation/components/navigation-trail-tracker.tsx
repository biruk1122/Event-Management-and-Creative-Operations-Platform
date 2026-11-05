"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { readTrail, recordVisit, writeTrail } from "../lib/navigation-trail";

/** Keeps the session's in-app visit trail current. Renders nothing. */
export function NavigationTrailTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const storage = window.sessionStorage;
      writeTrail(storage, recordVisit(readTrail(storage), pathname));
    } catch {
      // Session storage can be unavailable; the back button then uses its fallback.
    }
  }, [pathname]);

  return null;
}
