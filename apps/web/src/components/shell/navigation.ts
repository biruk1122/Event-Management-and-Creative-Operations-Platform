import type { Route } from "next";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { canReadEvents } from "@/features/events/lib/event-access";
import { canReadExpenses } from "@/features/expenses/lib/expense-access";
import { canReadSuppliers } from "@/features/suppliers/lib/supplier-access";
import { canReadProjects } from "@/features/projects/lib/project-access";
import { productionAbilities } from "@/features/productions/lib/production-access";
import { canReadCampaigns } from "@/features/campaigns/lib/campaign-access";
import { canEnterMarketingWorkspace } from "@/features/marketing-workspace/lib/marketing-workspace-access";
import { canAccessEmployeeManagement } from "@/features/employees/lib/employee-access";
import { canAccessAdministrationDocuments } from "@/features/letters/lib/letter-access";
import { canReadPartners } from "@/features/partners/lib/partner-access";
import { canReadTalent } from "@/features/talent/lib/talent-access";
import { readableKinds } from "@/features/workspaces/lib/workspace-access";
import { canEnter } from "@/features/dashboards/lib/dashboard-presentation";
import { analyticsAbilities } from "@/features/analytics/lib/analytics-presentation";
import { canEnterAttendance } from "@/features/attendance/lib/attendance-access";
import { canEnterLeave } from "@/features/leave/lib/leave-access";

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
    | "expenses"
    | "suppliers"
    | "projects"
    | "production"
    | "campaigns"
    | "partners"
    | "marketingWorkspace"
    | "talent"
    | "reports"
    | "analytics"
    | "teams"
    | "departments"
    | "users"
    | "employees"
    | "letters"
    | "documents"
    | "sharedWithMe"
    | "roles"
    | "workspaces"
    | "attendance"
    | "leave";
};

const HR_DEPARTMENT = "HR & Executive Officer";
const MARKETING_DEPARTMENT = "Marketing";

/** Only shipped routes; reuse their existing scoped authorization predicates. */
export function destinations(access: CurrentAccess): Destination[] {
  const holds = (key: string, scopes?: string[]) =>
    access.grants.some(
      (g) => g.permissionKey === key && (!scopes || scopes.includes(g.scope)),
    );
  // Department Manager grants are flat across every department (no per-
  // department branch in the RBAC catalog), so an HR & Executive Officer
  // manager technically holds the same event/expense/supplier/production/
  // campaign/partner grants as every other department manager. None of
  // those are HR's job - this hides them from the HR manager's own nav
  // (a UX convenience only, the same kind of department-name check
  // `canEnterMarketingWorkspace` already uses; it does not affect Super
  // Admin, who has no department, or what the backend actually permits).
  const isHrDepartment =
    access.department?.active === true &&
    access.department.name === HR_DEPARTMENT;
  // Same reasoning, Marketing-specific: a Marketing Department Manager also
  // flatly holds `project.*`/`production.budget.*`, but Production is a
  // separate department's own workspace, not Marketing's job - hide it from
  // Marketing's nav too.
  const isMarketingDepartment =
    access.department?.active === true &&
    access.department.name === MARKETING_DEPARTMENT;
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
  add(
    canEnterAttendance(access),
    "/attendance" as Route,
    "Attendance",
    "Work",
    "attendance",
  );
  add(canEnterLeave(access), "/leave" as Route, "Leave", "Work", "leave");
  add(
    canReadEvents(access) && !isHrDepartment,
    "/events",
    "Events",
    "Work",
    "events",
  );
  add(
    canReadExpenses(access) && !isHrDepartment,
    "/expenses",
    "Expenses",
    "Work",
    "expenses",
  );
  add(
    canReadSuppliers(access) && !isHrDepartment,
    "/suppliers",
    "Suppliers",
    "Work",
    "suppliers",
  );
  add(canReadProjects(access), "/projects", "Projects", "Work", "projects");
  add(
    productionAbilities(access).canRead &&
      !isHrDepartment &&
      !isMarketingDepartment,
    "/projects/production",
    "Production",
    "Work",
    "production",
  );
  add(
    canEnterMarketingWorkspace(access),
    "/marketing",
    "Marketing",
    "Work",
    "marketingWorkspace",
  );
  add(
    canReadCampaigns(access) && !isHrDepartment,
    "/campaigns",
    "Campaigns",
    "Work",
    "campaigns",
  );
  add(
    canReadPartners(access) && !isHrDepartment,
    "/partners",
    "Partners",
    "Work",
    "partners",
  );
  add(canReadTalent(access), "/talent", "Talent", "Work", "talent");
  add(
    canAccessAdministrationDocuments(access),
    "/letters",
    "Letters",
    "Work",
    "letters",
  );
  add(
    canAccessAdministrationDocuments(access),
    "/documents",
    "Documents",
    "Work",
    "documents",
  );
  // Every authenticated active employee can reach their own shared
  // records - there is no management-permission gate here, unlike
  // Letters/Documents above.
  add(true, "/shared-with-me", "Shared with Me", "Work", "sharedWithMe");
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
    canAccessEmployeeManagement(access),
    "/employees",
    "Employees",
    "Organization",
    "employees",
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
