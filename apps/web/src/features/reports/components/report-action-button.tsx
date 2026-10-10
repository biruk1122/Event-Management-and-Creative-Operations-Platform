import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/** Keep the initiating control focused while the existing request is pending. */
export function ReportActionButton({
  busy = false,
  onClick,
  className = "",
  ...props
}: ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button
      {...props}
      aria-disabled={busy || props.disabled || undefined}
      className={`min-h-11 aria-disabled:opacity-50 ${className}`}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
