import { cn } from "@/lib/utils";

/** Viewports crop whitespace from the original artwork; they do not redraw it. */
export function BrandLogo({
  compact = false,
  decorative = false,
  className,
}: {
  compact?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <svg
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Lela Creative Management"}
      aria-hidden={decorative || undefined}
      focusable="false"
      viewBox={compact ? "22 387 316 502" : "22 387 785 503"}
      className={cn(
        "block h-auto shrink-0 rounded-sm bg-white",
        compact ? "w-8" : "w-40",
        className,
      )}
    >
      <image
        href="/branding/lela-creative-management-logo.png"
        width="832"
        height="1264"
      />
    </svg>
  );
}
