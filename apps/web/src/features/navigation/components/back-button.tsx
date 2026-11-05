"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

import { hasInAppPrevious, readTrail } from "../lib/navigation-trail";

export interface BackButtonProps {
  /**
   * Where to go when the tab has no in-app page to return to, such as a
   * bookmark, a shared link or a new tab. This is the record's parent listing.
   */
  fallbackHref: Route;
}

/**
 * Returns to the page the user came from, with its query string (search,
 * filters, page) intact, because the browser keeps that history entry. Falls
 * back to the parent listing when the tab has no previous in-app page.
 */
export function BackButton({ fallbackHref }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const trail = readTrail(window.sessionStorage);
        if (hasInAppPrevious(trail)) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft aria-hidden="true" data-icon="inline-start" />
      Back
    </Button>
  );
}
