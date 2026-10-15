import { cn } from "@/lib/utils";

/**
 * Generated wordmark glyph: four rounded-end vertical bars (outer two full
 * height, inner two shorter) with a ring bridging the inner two near the
 * base, reading as the "l-o-l" of "lela". Single-color, no background shape.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 100"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <rect x="0" y="0" width="12" height="100" rx="6" fill="currentColor" />
      <rect x="20" y="0" width="12" height="64" rx="6" fill="currentColor" />
      <rect x="40" y="0" width="12" height="64" rx="6" fill="currentColor" />
      <rect x="60" y="0" width="12" height="100" rx="6" fill="currentColor" />
      <circle
        cx="36"
        cy="82"
        r="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
      />
    </svg>
  );
}
