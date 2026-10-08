import type { Route } from "next";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { canReadEvents } from "@/features/events/lib/event-access";
import { canReadProjects } from "@/features/projects/lib/project-access";
import { canReadCampaigns } from "@/features/campaigns/lib/campaign-access";
import { canReadTalent } from "@/features/talent/lib/talent-access";
import { readableKinds } from "@/features/workspaces/lib/workspace-access";
import { canEnter } from "@/features/dashboards/lib/dashboard-presentation";
import { analyticsAbilities } from "@/features/analytics/lib/analytics-presentation";

export type Destination = {
  href: Route;
  label: string;
  group: "Overview" | "Work" | "Collaboration" | "Organization";
  icon:
    | "dashboard"
    | "tasks"
    | "calendar"
    | "discuss"
    | "meetings"
    | "todo"
    | "events"
    | "projects"
    | "production"
    | "campaigns"
    | "talent"
    | "reports"
    | "analytics"
    | "teams"
    | "departments"
    | "users"
    | "roles"
    | "workspaces";
};

/** Only shipped routes; reuse their existing scoped authorization predicates. */
export function destinations(access: CurrentAccess): Destination[] {
  const holds = (key: string, scopes?: string[]) =>
    access.grants.some(
      (g) => g.permissionKey === key && (!scopes || scopes.includes(g.scope)),
    );
  const items: Destination[] = [];
  const add = (
    allowed: boolean,
    href: Route,
    label: string,
    group: Destination["group"],
    icon: Destination["icon"],
  ) => {
    if (allowed) items.push({ href, label, group, icon });
  };
  add(
    canEnter(access, "employee") || canEnter(access, "management"),
    "/dashboard",
    "Dashboard",
    "Overview",
    "dashboard",
  );
  add(holds("report.read"), "/reports", "Reports", "Overview", "reports");
  add(
    Object.values(analyticsAbilities(access)).some(Boolean),
    "/analytics",
    "Analytics",
    "Overview",
    "analytics",
  );
  add(holds("task.read"), "/tasks", "Tasks", "Work", "tasks");
  add(canReadEvents(access), "/events", "Events", "Work", "events");
  add(canReadProjects(access), "/projects", "Projects", "Work", "projects");
  add(
    canReadProjects(access),
    "/projects/production",
    "Production",
    "Work",
    "production",
  );
  add(canReadCampaigns(access), "/campaigns", "Campaigns", "Work", "campaigns");
  add(canReadTalent(access), "/talent", "Talent", "Work", "talent");
  add(
    readableKinds(access).length > 0,
    "/workspaces",
    "Workspaces",
    "Work",
    "workspaces",
  );
  add(
    holds("conversation.read"),
    "/discuss/dm" as Route,
    "Direct messages",
    "Collaboration",
    "discuss",
  );
  add(
    holds("channel.participate"),
    "/discuss/channels" as Route,
    "Channels",
    "Collaboration",
    "discuss",
  );
  add(
    holds("meeting.read"),
    "/meetings",
    "Meetings",
    "Collaboration",
    "meetings",
  );
  add(
    holds("calendar.read"),
    "/calendar",
    "Calendar",
    "Collaboration",
    "calendar",
  );
  add(holds("todo.read"), "/todos", "To-Do", "Collaboration", "todo");
  add(
    holds("team.read", ["ORGANIZATION", "DEPARTMENT"]),
    "/teams",
    "Teams",
    "Organization",
    "teams",
  );
  add(
    holds("department.read", ["ORGANIZATION", "DEPARTMENT"]),
    "/departments",
    "Departments",
    "Organization",
    "departments",
  );
  add(
    holds("user.read", ["ORGANIZATION"]),
    "/users",
    "Users",
    "Organization",
    "users",
  );
  add(
    holds("role.read", ["ORGANIZATION"]),
    "/settings/roles",
    "Roles and permissions",
    "Organization",
    "roles",
  );
  return items;
}

export function activeDestination(items: Destination[], pathname: string) {
  return items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** NAV-07: four user-approved priorities, omitted when not permitted. */
export function mobileDestinations(items: Destination[]): Destination[] {
  const discuss = items.find((item) => item.href.startsWith("/discuss/"));
  return [
    items.find((item) => item.href === "/dashboard"),
    items.find((item) => item.href === "/tasks"),
    items.find((item) => item.href === "/calendar"),
    discuss ? { ...discuss, label: "Discuss" } : undefined,
  ].filter((item): item is Destination => Boolean(item));
}
