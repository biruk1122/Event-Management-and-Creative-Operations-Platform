"use client";

import { usePathname } from "next/navigation";
import type { Route } from "next";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { leaveAbilities } from "../lib/leave-access";

export function LeaveNavigation() {
  const access = useCurrentAccess();
  const pathname = usePathname();
  if (!access.data) return null;
  const abilities = leaveAbilities(access.data);

  const items: { label: string; href: Route }[] = [];
  if (abilities.canRequestLeave) items.push({ label: "My leave", href: "/leave" as Route });
  if (abilities.canReadLeave) {
    items.push({ label: "Calendar", href: "/leave/calendar" as Route });
  }
  if (abilities.canReviewLeave) {
    items.push({ label: "Review requests", href: "/leave/review" as Route });
  }
  if (abilities.canGrantLeave) {
    items.push({ label: "Grants", href: "/leave/grants" as Route });
  }
  if (abilities.canManageTypes) {
    items.push({ label: "Leave types", href: "/leave/types" as Route });
  }
  if (items.length < 2) return null;

  return (
    <SectionNavigation
      label="Leave sections"
      items={items.map((item) => ({ ...item, current: pathname === item.href }))}
    />
  );
}
