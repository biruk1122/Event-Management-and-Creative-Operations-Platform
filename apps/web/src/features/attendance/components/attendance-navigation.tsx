"use client";

import { usePathname } from "next/navigation";
import type { Route } from "next";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { attendanceAbilities } from "../lib/attendance-access";

export function AttendanceNavigation() {
  const access = useCurrentAccess();
  const pathname = usePathname();
  if (!access.data) return null;
  const abilities = attendanceAbilities(access.data);

  const items: { label: string; href: Route }[] = [];
  if (abilities.canPunch) {
    items.push({ label: "My attendance", href: "/attendance" as Route });
  }
  if (abilities.canManageSchedule) {
    items.push({ label: "Shift scheduling", href: "/attendance/shifts" as Route });
  }
  if (abilities.canReviewOvertime) {
    items.push({ label: "Overtime", href: "/attendance/overtime" as Route });
  }
  if (abilities.canReviewExceptions) {
    items.push({ label: "Exceptions", href: "/attendance/exceptions" as Route });
  }
  if (abilities.canManageKiosks) {
    items.push({ label: "Kiosks", href: "/attendance/kiosks" as Route });
  }
  if (abilities.canReadReports) {
    items.push({ label: "Reports", href: "/attendance/reports" as Route });
  }
  if (abilities.canReadDetailedSessions) {
    items.push({
      label: "Detailed sessions",
      href: "/attendance/reports/sessions" as Route,
    });
  }
  if (abilities.canManageCalendar) {
    items.push({ label: "Work calendar", href: "/attendance/calendar" as Route });
  }
  if (items.length < 2) return null;

  return (
    <SectionNavigation
      label="Attendance sections"
      items={items.map((item) => ({ ...item, current: pathname === item.href }))}
    />
  );
}
