import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A keyboard-scrollable native table, with a visible accessible caption. */
export function Table({
  caption,
  className,
  children,
  ...props
}: ComponentProps<"table"> & { caption: string }) {
  return (
    <div
      role="region"
      aria-label={`${caption} table`}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-lg"
    >
      <table
        data-slot="table"
        className={cn(
          "[&_th]:border-border [&_td]:border-border w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:px-2 [&_td]:py-3 [&_td]:break-words [&_th]:border-b [&_th]:px-2 [&_th]:py-3 [&_th]:font-semibold [&_th]:break-words",
          className,
        )}
        {...props}
      >
        <caption className="mb-4 text-left font-semibold">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
