import { UserRoundCheck, UserRoundX, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export interface UserSummary {
  total: number | null;
  active: number | null;
  inactive: number | null;
}

const CARDS = [
  {
    key: "total",
    label: "Total users",
    icon: Users,
    tone: "bg-primary/10 text-primary",
  },
  {
    key: "active",
    label: "Active users",
    icon: UserRoundCheck,
    tone: "bg-success-background text-success",
  },
  {
    key: "inactive",
    label: "Inactive users",
    icon: UserRoundX,
    tone: "bg-muted text-muted-foreground",
  },
] as const;

/**
 * Headline counts for the Users list. Each figure is the authoritative total
 * for that status from the list API; a figure still loading shows a dash
 * rather than a guess.
 */
export function UserSummaryCards({ summary }: { summary: UserSummary }) {
  return (
    <section aria-label="User summary" className="grid gap-3 sm:grid-cols-3">
      {CARDS.map(({ key, label, icon: Icon, tone }) => {
        const value = summary[key];
        return (
          <div
            key={key}
            className="border-border bg-card flex items-center gap-4 rounded-2xl border p-5 shadow-xs"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-full",
                tone,
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tabular-nums">
                {value === null ? "—" : value}
              </p>
              <p className="text-muted-foreground text-sm">{label}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
