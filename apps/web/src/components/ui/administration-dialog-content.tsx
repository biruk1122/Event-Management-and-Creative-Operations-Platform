"use client";

import { useRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { DialogContent } from "./dialog";
import styles from "./administration.module.css";

/** These controlled dialogs open from list buttons, not Radix triggers. */
export function AdministrationDialogContent({
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  fallbackSelector = "[data-admin-toolbar] button:not(:disabled), [data-admin-filters] input",
  ...props
}: ComponentProps<typeof DialogContent> & { fallbackSelector?: string }) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <DialogContent
      {...props}
      className={cn(styles.dialog, className)}
      onOpenAutoFocus={(event) => {
        opener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        onOpenAutoFocus?.(event);
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        const target = opener.current;
        // A deleted/renamed/refetched row may disappear. Fall back to the
        // surviving create action, then the first usable control in this area.
        const fallback = document.querySelector<HTMLElement>(fallbackSelector);
        const destination =
          target?.isConnected && target.getClientRects().length
            ? target
            : fallback;
        if (destination) {
          event.preventDefault();
          destination.focus();
        }
      }}
    />
  );
}
