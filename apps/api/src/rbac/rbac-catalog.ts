import type { PermissionScope } from "../generated/prisma/client.js";

/**
 * The permission catalog, baseline grants, and role matrix, transcribed
 * directly from `docs/product/permission-catalog-and-role-matrix.md`. This
 * module is the single source of truth `seed-rbac.ts` applies; it holds no
 * behavior of its own. Any change here must trace back to that document.
 */

export interface PermissionDefinition {
  readonly key: string;
  readonly description: string;
}

export interface GrantDefinition {
  readonly permissionKey: string;
  readonly scope: PermissionScope;
}

export interface RoleDefinition {
  readonly name: string;
  readonly description: string;
  readonly grants: readonly GrantDefinition[];
}

/** Every permission key. Keys are scope-free; see "Permission catalog". */
export const PERMISSIONS: readonly PermissionDefinition[] = [
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
  {
    key: "user.assign_team",
    description: "Add or remove a user from a team.",
  },
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
  {
    key: "team.manage_members",
    description: "Add or remove team members.",
  },
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
  {
    key: "talent.read",
    description: "View talent profiles and schedules.",
  },
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
  {
    key: "task.comment.create",
    description: "Add a comment to a task.",
  },
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
  { key: "calendar.create", description: "Create a personal calendar entry." },
  {
    key: "calendar.update",
    description: "Update one's own personal calendar entry.",
  },
  {
    key: "calendar.delete",
    description: "Delete one's own personal calendar entry.",
  },
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
] as const;

/**
 * Grants every authenticated active user holds independent of role, additive
 * to the role matrix. `self` is the Team Member definition of that scope:
 * records the user is assigned to, authored, or was invited to - which covers
 * the conversations and channels the user is a member of (PC-01 owns the
 * precise resolution rules). See "Baseline grants for every authenticated
 * user".
 */
export const BASELINE_GRANTS: readonly GrantDefinition[] = [
  { permissionKey: "profile.read", scope: "SELF" },
  { permissionKey: "profile.update", scope: "SELF" },
  { permissionKey: "directory.read", scope: "ORGANIZATION" },
  { permissionKey: "dashboard.read", scope: "SELF" },
  { permissionKey: "notification.read", scope: "SELF" },
  { permissionKey: "calendar.read", scope: "SELF" },
  { permissionKey: "calendar.create", scope: "SELF" },
  { permissionKey: "calendar.update", scope: "SELF" },
  { permissionKey: "calendar.delete", scope: "SELF" },
  { permissionKey: "todo.create", scope: "SELF" },
  { permissionKey: "todo.read", scope: "SELF" },
  { permissionKey: "todo.update", scope: "SELF" },
  { permissionKey: "todo.delete", scope: "SELF" },
  { permissionKey: "meeting.respond", scope: "SELF" },
  { permissionKey: "message.send", scope: "SELF" },
  { permissionKey: "conversation.create", scope: "SELF" },
  { permissionKey: "conversation.read", scope: "SELF" },
  { permissionKey: "channel.participate", scope: "SELF" },
];

/**
 * Super Admin holds every key in the catalog at `organization` scope - stated
 * as an explicit grant set, not a code-level bypass (PC-08). Generated from
 * `PERMISSIONS` rather than hand-duplicated so it cannot drift from the
 * catalog it must cover completely.
 */
const SUPER_ADMIN_GRANTS: readonly GrantDefinition[] = PERMISSIONS.map(
  (permission) => ({ permissionKey: permission.key, scope: "ORGANIZATION" }),
);

const MANAGEMENT_ADMINISTRATOR_GRANTS: readonly GrantDefinition[] = [
  { permissionKey: "event.create", scope: "ORGANIZATION" },
  { permissionKey: "event.read", scope: "ORGANIZATION" },
  { permissionKey: "event.update", scope: "ORGANIZATION" },
  { permissionKey: "event.assign_manager", scope: "ORGANIZATION" },
  { permissionKey: "event.assign_teams", scope: "ORGANIZATION" },
  { permissionKey: "event.transition_status", scope: "ORGANIZATION" },
  { permissionKey: "event.budget.read", scope: "ORGANIZATION" },
  { permissionKey: "event.budget.update", scope: "ORGANIZATION" },
  { permissionKey: "project.create", scope: "ORGANIZATION" },
  { permissionKey: "project.read", scope: "ORGANIZATION" },
  { permissionKey: "project.update", scope: "ORGANIZATION" },
  { permissionKey: "project.assign", scope: "ORGANIZATION" },
  { permissionKey: "project.transition_status", scope: "ORGANIZATION" },
  { permissionKey: "campaign.create", scope: "ORGANIZATION" },
  { permissionKey: "campaign.read", scope: "ORGANIZATION" },
  { permissionKey: "campaign.update", scope: "ORGANIZATION" },
  { permissionKey: "campaign.assign", scope: "ORGANIZATION" },
  { permissionKey: "campaign.transition_status", scope: "ORGANIZATION" },
  { permissionKey: "campaign.activity.manage", scope: "ORGANIZATION" },
  { permissionKey: "campaign.budget.read", scope: "ORGANIZATION" },
  { permissionKey: "campaign.budget.update", scope: "ORGANIZATION" },
  { permissionKey: "team.assign_to_work", scope: "ORGANIZATION" },
  { permissionKey: "task.create", scope: "ORGANIZATION" },
  { permissionKey: "task.read", scope: "ORGANIZATION" },
  { permissionKey: "task.assign", scope: "ORGANIZATION" },
  { permissionKey: "task.update", scope: "ORGANIZATION" },
  { permissionKey: "task.review", scope: "ORGANIZATION" },
  { permissionKey: "meeting.create", scope: "ORGANIZATION" },
  { permissionKey: "meeting.read", scope: "ORGANIZATION" },
  { permissionKey: "meeting.update", scope: "ORGANIZATION" },
  { permissionKey: "channel.create", scope: "ORGANIZATION" },
  { permissionKey: "channel.manage", scope: "ORGANIZATION" },
  { permissionKey: "report.read", scope: "ORGANIZATION" },
  { permissionKey: "report.review", scope: "ORGANIZATION" },
  { permissionKey: "analytics.management.read", scope: "MANAGEMENT" },
  {
    permissionKey: "analytics.department_performance.read",
    scope: "MANAGEMENT",
  },
  {
    permissionKey: "analytics.employee_performance.read",
    scope: "MANAGEMENT",
  },
  { permissionKey: "dashboard.management.read", scope: "MANAGEMENT" },
  { permissionKey: "activity.read", scope: "ORGANIZATION" },
];

const DEPARTMENT_MANAGER_GRANTS: readonly GrantDefinition[] = [
  { permissionKey: "department.read", scope: "DEPARTMENT" },
  { permissionKey: "department.manage_activities", scope: "DEPARTMENT" },
  { permissionKey: "team.read", scope: "DEPARTMENT" },
  { permissionKey: "task.create", scope: "DEPARTMENT" },
  { permissionKey: "task.read", scope: "DEPARTMENT" },
  { permissionKey: "task.assign", scope: "DEPARTMENT" },
  { permissionKey: "task.update", scope: "DEPARTMENT" },
  { permissionKey: "task.review", scope: "DEPARTMENT" },
  { permissionKey: "event.read", scope: "DEPARTMENT" },
  { permissionKey: "project.read", scope: "DEPARTMENT" },
  { permissionKey: "campaign.read", scope: "DEPARTMENT" },
  { permissionKey: "meeting.create", scope: "DEPARTMENT" },
  { permissionKey: "meeting.read", scope: "DEPARTMENT" },
  { permissionKey: "meeting.update", scope: "DEPARTMENT" },
  { permissionKey: "channel.create", scope: "DEPARTMENT" },
  { permissionKey: "channel.manage", scope: "DEPARTMENT" },
  { permissionKey: "calendar.read", scope: "DEPARTMENT" },
  { permissionKey: "report.create", scope: "DEPARTMENT" },
  { permissionKey: "report.submit", scope: "DEPARTMENT" },
  { permissionKey: "report.read", scope: "DEPARTMENT" },
  {
    permissionKey: "analytics.department_performance.read",
    scope: "DEPARTMENT",
  },
];

const TEAM_MEMBER_GRANTS: readonly GrantDefinition[] = [
  { permissionKey: "task.read", scope: "SELF" },
  { permissionKey: "task.update_status", scope: "SELF" },
  { permissionKey: "task.update_progress", scope: "SELF" },
  { permissionKey: "task.submit", scope: "SELF" },
  { permissionKey: "task.comment.create", scope: "SELF" },
  { permissionKey: "task.attachment.create", scope: "SELF" },
  { permissionKey: "report.create", scope: "SELF" },
  { permissionKey: "report.submit", scope: "SELF" },
  { permissionKey: "report.read", scope: "SELF" },
  { permissionKey: "meeting.read", scope: "SELF" },
];

const TALENT_MANAGER_GRANTS: readonly GrantDefinition[] = [
  { permissionKey: "talent.create", scope: "ORGANIZATION" },
  { permissionKey: "talent.read", scope: "ORGANIZATION" },
  { permissionKey: "talent.update", scope: "ORGANIZATION" },
  { permissionKey: "talent.transition_status", scope: "ORGANIZATION" },
  { permissionKey: "talent.assign", scope: "ORGANIZATION" },
  { permissionKey: "talent.manage_activities", scope: "ORGANIZATION" },
  { permissionKey: "calendar.read", scope: "ORGANIZATION" },
];

/**
 * The five SRS roles (section 4), seeded as ordinary data - never a code
 * branch. Each role holds only the grants listed here in addition to
 * `BASELINE_GRANTS`; there is no inheritance between roles.
 */
export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    name: "Super Admin",
    description:
      "Holds every administrative and operational permission at organization scope.",
    grants: SUPER_ADMIN_GRANTS,
  },
  {
    name: "Management/Administrator",
    description:
      "Manages events, projects, campaigns, and reporting across the organization.",
    grants: MANAGEMENT_ADMINISTRATOR_GRANTS,
  },
  {
    name: "Department Manager",
    description: "Manages the work and reporting of one department.",
    grants: DEPARTMENT_MANAGER_GRANTS,
  },
  {
    name: "Team Member",
    description: "Works on assigned tasks and submits reports.",
    grants: TEAM_MEMBER_GRANTS,
  },
  {
    name: "Talent Manager",
    description: "Manages talent records, schedules, and assignments.",
    grants: TALENT_MANAGER_GRANTS,
  },
];
