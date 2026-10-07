import type { components } from "@event-platform/api-client";
import type { Route } from "next";

export type DashboardAccess = components["schemas"]["CurrentAccessResponse"];
export type DashboardCard = components["schemas"]["DashboardCard"];
export type Audience = "management" | "employee";
export type DashboardPanel =
  DashboardCard | { state: "loading" } | { state: "disconnected" };
type Group = "Overview" | "Today" | "Communication" | "Analytics" | "My work";
type Definition = {
  key: string;
  title: string;
  group: Group;
  permission: string;
  scopes: string[];
  href?: Route;
};
const org = ["ORGANIZATION"];
const operational = ["ORGANIZATION", "DEPARTMENT", "SELF"];
const personal = ["ORGANIZATION", "SELF"];
const analytics = ["ORGANIZATION", "MANAGEMENT"];
function card(
  key: string,
  title: string,
  group: Group,
  permission: string,
  scopes = operational,
  href?: Route,
): Definition {
  return { key, title, group, permission, scopes, ...(href ? { href } : {}) };
}
export const managementCards: Definition[] = [
  card("totalEvents", "Total events", "Overview", "event.read", org, "/events"),
  card(
    "upcomingEvents",
    "Upcoming events",
    "Overview",
    "event.read",
    org,
    "/events",
  ),
  card(
    "activeProjects",
    "Active projects",
    "Overview",
    "project.read",
    org,
    "/projects",
  ),
  card(
    "activeCampaigns",
    "Active campaigns",
    "Overview",
    "campaign.read",
    org,
    "/campaigns",
  ),
  card("pendingTasks", "Pending tasks", "Overview", "task.read", org, "/tasks"),
  card(
    "completedTasks",
    "Completed tasks",
    "Overview",
    "task.read",
    org,
    "/tasks",
  ),
  card("overdueTasks", "Overdue tasks", "Overview", "task.read", org, "/tasks"),
  card(
    "activeEmployees",
    "Active employees",
    "Overview",
    "user.read",
    org,
    "/users",
  ),
  card(
    "activeTalents",
    "Active talents",
    "Overview",
    "talent.read",
    org,
    "/talent",
  ),
  card("todayEvents", "Today's events", "Today", "event.read", org, "/events"),
  card(
    "todayMeetings",
    "Today's meetings",
    "Today",
    "meeting.read",
    operational,
    "/meetings",
  ),
  card("todayDeadlines", "Today's deadlines", "Today", "deadlines"),
  card(
    "attentionTasks",
    "Tasks requiring attention",
    "Today",
    "task.read",
    operational,
    "/tasks",
  ),
  card(
    "overdueActivities",
    "Overdue campaign activities",
    "Today",
    "campaign.read",
    org,
    "/campaigns",
  ),
  card(
    "unreadMessages",
    "Unread messages",
    "Communication",
    "conversation.read",
    personal,
    "/discuss/dm" as Route,
  ),
  card(
    "activeChannels",
    "Active channels",
    "Communication",
    "conversation.read",
    personal,
    "/discuss/channels" as Route,
  ),
  card(
    "upcomingMeetings",
    "Upcoming meetings",
    "Communication",
    "meeting.read",
    operational,
    "/meetings",
  ),
  card(
    "taskCompletionRate",
    "Task completion rate",
    "Analytics",
    "analytics.management.read",
    analytics,
    "/analytics",
  ),
  card(
    "departmentPerformance",
    "Department performance",
    "Analytics",
    "analytics.department_performance.read",
    [...analytics, "DEPARTMENT"],
    "/analytics",
  ),
  card(
    "eventProgress",
    "Event progress",
    "Analytics",
    "analytics.management.read",
    analytics,
    "/analytics",
  ),
  card(
    "marketingProgress",
    "Marketing progress",
    "Analytics",
    "analytics.management.read",
    analytics,
    "/analytics",
  ),
  card(
    "promotionPerformance",
    "Promotion performance",
    "Analytics",
    "analytics.management.read",
    analytics,
    "/analytics",
  ),
  card(
    "monthlyActivity",
    "Monthly activity",
    "Analytics",
    "analytics.management.read",
    analytics,
    "/analytics",
  ),
];
export const employeeCards: Definition[] = [
  card("myTasks", "My tasks", "My work", "task.read", operational, "/tasks"),
  card("myTodo", "My To-Do", "My work", "todo.read", personal, "/todos"),
  card(
    "todaySchedule",
    "Today's schedule",
    "My work",
    "calendar.read",
    personal,
    "/calendar",
  ),
  card(
    "myUpcomingMeetings",
    "My upcoming meetings",
    "My work",
    "meeting.read",
    operational,
    "/meetings",
  ),
  card(
    "myUpcomingDeadlines",
    "My upcoming deadlines",
    "My work",
    "personalDeadlines",
  ),
  card(
    "myUnreadMessages",
    "My unread messages",
    "My work",
    "conversation.read",
    personal,
    "/discuss/dm" as Route,
  ),
  card(
    "recentActivity",
    "Recent task activity",
    "My work",
    "task.read",
    operational,
    "/tasks",
  ),
];
export function hasGrant(
  access: DashboardAccess,
  key: string,
  scopes: string[],
) {
  return access.grants.some(
    (grant) => grant.permissionKey === key && scopes.includes(grant.scope),
  );
}
export function canEnter(access: DashboardAccess, audience: Audience) {
  return audience === "management"
    ? hasGrant(access, "dashboard.management.read", analytics)
    : hasGrant(access, "dashboard.read", ["SELF"]);
}
export function visibleCards(access: DashboardAccess, audience: Audience) {
  if (!canEnter(access, audience)) return [];
  return (audience === "management" ? managementCards : employeeCards).filter(
    (item) => {
      if (
        item.permission === "deadlines" ||
        item.permission === "personalDeadlines"
      ) {
        return (
          hasGrant(access, "task.read", operational) ||
          hasGrant(access, "project.read", org) ||
          (item.permission === "personalDeadlines" &&
            hasGrant(access, "todo.read", personal))
        );
      }
      return hasGrant(access, item.permission, item.scopes);
    },
  );
}
