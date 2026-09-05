import type { Permission, RoleGrant, RoleWithGrants } from "../lib/rbac-types";

/**
 * Placeholder content for the roles and permissions UI, transcribed from the
 * real catalog in `docs/product/permission-catalog-and-role-matrix.md` (the
 * same source `apps/api`'s `rbac-catalog.ts` seeds from) so the surface is
 * exercised at its real scale and vocabulary. RBAC-05 replaces every seam in
 * this feature with real `@event-platform/api-client` calls; nothing here is
 * a production dependency.
 */
export const FIXTURE_PERMISSIONS: readonly Permission[] = [
  // Identity and access administration
  { key: "user.create", description: "Create a user account." },
  {
    key: "user.read",
    description: "View user accounts and their role, department, and status.",
  },
  { key: "user.update", description: "Update user account fields." },
  {
    key: "user.deactivate",
    description: "Deactivate a user (User access Active -> Inactive).",
  },
  { key: "user.assign_role", description: "Assign or change a user's role." },
  {
    key: "user.assign_department",
    description: "Assign or change a user's department.",
  },
  { key: "user.assign_team", description: "Add or remove a user from a team." },
  {
    key: "user.manage_status",
    description: "Change a user's status other than through deactivation.",
  },
  { key: "role.create", description: "Create a configurable role." },
  { key: "role.read", description: "View roles and their grants." },
  { key: "role.update", description: "Rename or describe a role." },
  { key: "role.delete", description: "Remove a role that is not in use." },
  {
    key: "role.configure_permissions",
    description: "Add or remove permission grants on a role.",
  },
  { key: "settings.read", description: "View organization system settings." },
  {
    key: "settings.update",
    description: "Change organization system settings.",
  },
  {
    key: "audit.read",
    description: "Read the security and governance audit log.",
  },
  {
    key: "activity.read",
    description:
      "Read cross-module activity history beyond the acting user's own.",
  },

  // Profile and personal surface
  { key: "profile.read", description: "View one's own full profile." },
  {
    key: "profile.update",
    description: "Update approved fields on one's own profile.",
  },
  {
    key: "directory.read",
    description:
      "View other users' name, role, and department for assignment and @mention.",
  },
  {
    key: "dashboard.read",
    description: "View the dashboard for one's own role.",
  },
  {
    key: "dashboard.management.read",
    description:
      "View the management dashboard and its organization-wide overview.",
  },
  {
    key: "notification.read",
    description: "View and mark one's own notifications.",
  },

  // Organization structure
  { key: "department.create", description: "Create a department." },
  {
    key: "department.read",
    description: "View a department and its composition.",
  },
  { key: "department.update", description: "Update department fields." },
  {
    key: "department.delete",
    description: "Remove a department that is not in use.",
  },
  {
    key: "department.assign_manager",
    description: "Set or change a department's manager.",
  },
  {
    key: "department.manage_activities",
    description: "Manage the work items owned by a department.",
  },
  { key: "team.create", description: "Create a team." },
  { key: "team.read", description: "View a team and its members." },
  { key: "team.update", description: "Update team fields." },
  { key: "team.delete", description: "Remove a team that is not in use." },
  {
    key: "team.assign_manager",
    description: "Set or change a team's manager.",
  },
  { key: "team.manage_members", description: "Add or remove team members." },
  {
    key: "team.assign_to_work",
    description: "Assign a team to an event, project, or campaign.",
  },

  // Events
  { key: "event.create", description: "Create an event." },
  { key: "event.read", description: "View an event and its workspace." },
  { key: "event.update", description: "Update event fields." },
  {
    key: "event.delete",
    description: "Remove an event. Delete versus archive is open in PC-03.",
  },
  { key: "event.assign_manager", description: "Assign the event manager." },
  { key: "event.assign_teams", description: "Assign teams to an event." },
  {
    key: "event.transition_status",
    description: "Move an event through its approved lifecycle states.",
  },
  {
    key: "event.budget.read",
    description: "View an event budget. Sensitive; see PC-04.",
  },
  {
    key: "event.budget.update",
    description: "Set or change an event budget. Sensitive; see PC-04.",
  },

  // Projects and campaigns
  {
    key: "project.create",
    description: "Create a general or production project.",
  },
  {
    key: "project.read",
    description: "View a project, including its progress.",
  },
  { key: "project.update", description: "Update project fields." },
  {
    key: "project.delete",
    description: "Remove a project. Delete versus archive is open in PC-03.",
  },
  {
    key: "project.assign",
    description: "Assign a manager or team to a project.",
  },
  {
    key: "project.transition_status",
    description: "Move a project through its approved lifecycle states.",
  },
  {
    key: "campaign.create",
    description: "Create a marketing or promotion campaign.",
  },
  {
    key: "campaign.read",
    description: "View a campaign, including its progress.",
  },
  {
    key: "campaign.update",
    description: "Update campaign fields, including marketing strategy.",
  },
  {
    key: "campaign.delete",
    description: "Remove a campaign. Delete versus archive is open in PC-03.",
  },
  {
    key: "campaign.assign",
    description: "Assign a manager or team to a campaign.",
  },
  {
    key: "campaign.transition_status",
    description: "Move a campaign through its approved lifecycle states.",
  },
  {
    key: "campaign.budget.read",
    description: "View a campaign budget. Sensitive; see PC-04.",
  },
  {
    key: "campaign.budget.update",
    description: "Set or change a campaign budget. Sensitive; see PC-04.",
  },
  {
    key: "campaign.activity.manage",
    description:
      "Create and manage campaign, promotion, and marketing activities.",
  },

  // Talent
  { key: "talent.create", description: "Create a talent profile." },
  { key: "talent.read", description: "View talent profiles and schedules." },
  {
    key: "talent.update",
    description: "Update talent profile fields, including availability.",
  },
  {
    key: "talent.transition_status",
    description: "Move talent through its approved availability states.",
  },
  {
    key: "talent.assign",
    description:
      "Assign talent to an event, project, campaign, or promotional activity.",
  },
  {
    key: "talent.manage_activities",
    description: "Manage talent activities and engagements.",
  },

  // Tasks and collaboration
  { key: "task.create", description: "Create a task." },
  { key: "task.read", description: "View a task." },
  {
    key: "task.update",
    description: "Update task fields other than lifecycle state and progress.",
  },
  {
    key: "task.assign",
    description: "Add or remove assigned users on a task.",
  },
  {
    key: "task.update_status",
    description:
      "Change a task's lifecycle state within an assignee's allowed transitions.",
  },
  {
    key: "task.update_progress",
    description: "Update a task's progress percentage.",
  },
  { key: "task.submit", description: "Move an assigned task to Under Review." },
  {
    key: "task.review",
    description:
      "Record Approved or Changes Requested while a task is Under Review.",
  },
  { key: "task.comment.create", description: "Add a comment to a task." },
  {
    key: "task.attachment.create",
    description: "Attach a managed file to a task.",
  },
  {
    key: "message.send",
    description: "Send a direct, group, or channel message.",
  },
  {
    key: "conversation.create",
    description: "Start a direct or group conversation.",
  },
  {
    key: "conversation.read",
    description: "Read a conversation the user is a member of.",
  },
  {
    key: "channel.create",
    description:
      "Create a channel, including event, project, and department channels.",
  },
  {
    key: "channel.manage",
    description: "Manage a channel's membership and settings.",
  },
  {
    key: "channel.participate",
    description: "Join and post in a channel the user is authorized to access.",
  },

  // Meetings, calendar, and personal work
  { key: "meeting.create", description: "Create and schedule a meeting." },
  {
    key: "meeting.read",
    description: "View a meeting the user organizes or is invited to.",
  },
  {
    key: "meeting.update",
    description: "Update or move a meeting the user organizes.",
  },
  {
    key: "meeting.respond",
    description:
      "Record a Pending, Accepted, or Declined participant response.",
  },
  { key: "calendar.read", description: "View calendar data within scope." },
  { key: "todo.create", description: "Create a personal To-Do item." },
  { key: "todo.read", description: "View one's own To-Do items." },
  { key: "todo.update", description: "Update one's own To-Do items." },
  { key: "todo.delete", description: "Delete one's own To-Do items." },

  // Reporting and analytics
  { key: "report.create", description: "Create a report draft." },
  { key: "report.submit", description: "Submit a report for review." },
  { key: "report.read", description: "Read reports within scope." },
  {
    key: "report.review",
    description: "Move a submitted report to Reviewed or Changes Requested.",
  },
  {
    key: "analytics.management.read",
    description: "View management analytics. Sensitive.",
  },
  {
    key: "analytics.department_performance.read",
    description: "View department performance measures. Sensitive.",
  },
  {
    key: "analytics.employee_performance.read",
    description: "View employee performance measures. Sensitive.",
  },
];

const now = "2026-09-01T09:00:00.000Z";

function role(
  id: string,
  name: string,
  description: string,
  isSystem: boolean,
) {
  return { id, name, description, isSystem, createdAt: now, updatedAt: now };
}

function grants(
  entries: ReadonlyArray<[string, RoleGrant["scope"]]>,
): RoleGrant[] {
  return entries.map(([permissionKey, scope]) => ({ permissionKey, scope }));
}

const SUPER_ADMIN_ID = "018f2c9e-0001-7000-8000-000000000001";
const MANAGEMENT_ID = "018f2c9e-0001-7000-8000-000000000002";
const DEPARTMENT_MANAGER_ID = "018f2c9e-0001-7000-8000-000000000003";
const TEAM_MEMBER_ID = "018f2c9e-0001-7000-8000-000000000004";
const TALENT_MANAGER_ID = "018f2c9e-0001-7000-8000-000000000005";
const REGIONAL_COORDINATOR_ID = "018f2c9e-0001-7000-8000-000000000006";

export const FIXTURE_ROLES = [
  role(
    SUPER_ADMIN_ID,
    "Super Admin",
    "Holds every administrative and operational permission at organization scope.",
    true,
  ),
  role(
    MANAGEMENT_ID,
    "Management/Administrator",
    "Manages events, projects, campaigns, and reporting across the organization.",
    true,
  ),
  role(
    DEPARTMENT_MANAGER_ID,
    "Department Manager",
    "Manages the work and reporting of one department.",
    true,
  ),
  role(
    TEAM_MEMBER_ID,
    "Team Member",
    "Works on assigned tasks and submits reports.",
    true,
  ),
  role(
    TALENT_MANAGER_ID,
    "Talent Manager",
    "Manages talent records, schedules, and assignments.",
    true,
  ),
  role(
    REGIONAL_COORDINATOR_ID,
    "Regional Coordinator",
    "Coordinates activity across one region.",
    false,
  ),
];

export const FIXTURE_ROLE_GRANTS: Record<string, RoleWithGrants> = {
  [SUPER_ADMIN_ID]: {
    ...FIXTURE_ROLES[0]!,
    grants: FIXTURE_PERMISSIONS.map((permission) => ({
      permissionKey: permission.key,
      scope: "ORGANIZATION",
    })),
  },
  [MANAGEMENT_ID]: {
    ...FIXTURE_ROLES[1]!,
    grants: grants([
      ["event.create", "ORGANIZATION"],
      ["event.read", "ORGANIZATION"],
      ["event.update", "ORGANIZATION"],
      ["event.assign_manager", "ORGANIZATION"],
      ["event.assign_teams", "ORGANIZATION"],
      ["event.transition_status", "ORGANIZATION"],
      ["event.budget.read", "ORGANIZATION"],
      ["event.budget.update", "ORGANIZATION"],
      ["project.create", "ORGANIZATION"],
      ["project.read", "ORGANIZATION"],
      ["project.update", "ORGANIZATION"],
      ["project.assign", "ORGANIZATION"],
      ["project.transition_status", "ORGANIZATION"],
      ["campaign.create", "ORGANIZATION"],
      ["campaign.read", "ORGANIZATION"],
      ["campaign.update", "ORGANIZATION"],
      ["campaign.assign", "ORGANIZATION"],
      ["campaign.transition_status", "ORGANIZATION"],
      ["campaign.activity.manage", "ORGANIZATION"],
      ["campaign.budget.read", "ORGANIZATION"],
      ["campaign.budget.update", "ORGANIZATION"],
      ["team.assign_to_work", "ORGANIZATION"],
      ["task.create", "ORGANIZATION"],
      ["task.read", "ORGANIZATION"],
      ["task.assign", "ORGANIZATION"],
      ["task.update", "ORGANIZATION"],
      ["task.review", "ORGANIZATION"],
      ["meeting.create", "ORGANIZATION"],
      ["meeting.read", "ORGANIZATION"],
      ["meeting.update", "ORGANIZATION"],
      ["channel.create", "ORGANIZATION"],
      ["channel.manage", "ORGANIZATION"],
      ["report.read", "ORGANIZATION"],
      ["report.review", "ORGANIZATION"],
      ["analytics.management.read", "MANAGEMENT"],
      ["analytics.department_performance.read", "MANAGEMENT"],
      ["analytics.employee_performance.read", "MANAGEMENT"],
      ["dashboard.management.read", "MANAGEMENT"],
      ["activity.read", "ORGANIZATION"],
    ]),
  },
  [DEPARTMENT_MANAGER_ID]: {
    ...FIXTURE_ROLES[2]!,
    grants: grants([
      ["department.read", "DEPARTMENT"],
      ["department.manage_activities", "DEPARTMENT"],
      ["team.read", "DEPARTMENT"],
      ["task.create", "DEPARTMENT"],
      ["task.read", "DEPARTMENT"],
      ["task.assign", "DEPARTMENT"],
      ["task.update", "DEPARTMENT"],
      ["task.review", "DEPARTMENT"],
      ["event.read", "DEPARTMENT"],
      ["project.read", "DEPARTMENT"],
      ["campaign.read", "DEPARTMENT"],
      ["meeting.create", "DEPARTMENT"],
      ["meeting.read", "DEPARTMENT"],
      ["meeting.update", "DEPARTMENT"],
      ["channel.create", "DEPARTMENT"],
      ["channel.manage", "DEPARTMENT"],
      ["calendar.read", "DEPARTMENT"],
      ["report.create", "DEPARTMENT"],
      ["report.submit", "DEPARTMENT"],
      ["report.read", "DEPARTMENT"],
      ["analytics.department_performance.read", "DEPARTMENT"],
    ]),
  },
  [TEAM_MEMBER_ID]: {
    ...FIXTURE_ROLES[3]!,
    grants: grants([
      ["task.read", "SELF"],
      ["task.update_status", "SELF"],
      ["task.update_progress", "SELF"],
      ["task.submit", "SELF"],
      ["task.comment.create", "SELF"],
      ["task.attachment.create", "SELF"],
      ["report.create", "SELF"],
      ["report.submit", "SELF"],
      ["report.read", "SELF"],
      ["meeting.read", "SELF"],
    ]),
  },
  [TALENT_MANAGER_ID]: {
    ...FIXTURE_ROLES[4]!,
    grants: grants([
      ["talent.create", "ORGANIZATION"],
      ["talent.read", "ORGANIZATION"],
      ["talent.update", "ORGANIZATION"],
      ["talent.transition_status", "ORGANIZATION"],
      ["talent.assign", "ORGANIZATION"],
      ["talent.manage_activities", "ORGANIZATION"],
      ["calendar.read", "ORGANIZATION"],
    ]),
  },
  [REGIONAL_COORDINATOR_ID]: {
    ...FIXTURE_ROLES[5]!,
    grants: grants([
      ["event.read", "DEPARTMENT"],
      ["task.read", "DEPARTMENT"],
      ["report.read", "DEPARTMENT"],
    ]),
  },
};
