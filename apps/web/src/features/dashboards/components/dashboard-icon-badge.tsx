import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconTone = "primary" | "success" | "warning" | "information";

const toneClasses: Record<IconTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-background text-success",
  warning: "bg-warning-background text-warning",
  information: "bg-information-background text-information",
};

/** A small rounded icon chip for a dashboard card, colored by what the data
 * means (success/warning/information/neutral) - never by role or
 * department, so it never encodes authorization through color. */
export function DashboardIconBadge({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
        toneClasses[tone],
      )}
    >
      <Icon size={20} />
    </span>
  );
}
