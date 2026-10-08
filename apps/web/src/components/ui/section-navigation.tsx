import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/** Route links, not ARIA tabs: native link keyboard behavior is intentional. */
export function SectionNavigation({
  label,
  items,
}: {
  label: string;
  items: readonly { label: string; href: Route; current?: boolean }[];
}) {
  return (
    <nav
      aria-label={label}
      className="border-border flex flex-wrap gap-2 border-b pb-3"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring rounded-lg px-3 py-2 text-sm underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            item.current
              ? "bg-secondary text-secondary-foreground font-semibold underline"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
