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
    key: "production.budget.read",
    description: "Read a production's budget. Sensitive; see PC-04.",
  },
  {
    key: "production.budget.update",
    description: "Set or change a production's budget. Sensitive; see PC-04.",
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
    key: "report.attachment.create",
    description: "Attach a managed file to a report.",
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

  // Event & office management: expenses and suppliers (EOM-01)
  { key: "expense.create", description: "Create an expense draft." },
  { key: "expense.read", description: "View an expense and its history." },
  {
    key: "expense.update",
    description: "Edit an expense draft or a rejected expense.",
  },
  { key: "expense.submit", description: "Submit an expense for approval." },
  {
    key: "expense.approve",
    description:
      "Approve or reject a submitted expense. Sensitive; Super Admin only by design.",
  },
  {
    key: "expense.attachment.create",
    description: "Attach a managed file (receipt or invoice) to an expense.",
  },
  { key: "supplier.create", description: "Create a supplier directory entry." },
  { key: "supplier.read", description: "View a supplier directory entry." },
  { key: "supplier.update", description: "Update a supplier directory entry." },

  // Sponsorships and partnerships (Marketing Department Workspace)
  {
    key: "partner.create",
    description: "Create a sponsor, media, or partner relationship record.",
  },
  {
    key: "partner.read",
    description: "View a partner relationship record.",
  },
  {
    key: "partner.update",
    description:
      "Update a partner relationship's fields, stage, and follow-up date.",
  },
  {
    key: "partner.activity.create",
    description:
      "Log a discussion note or communication-history entry on a partner relationship.",
  },

  // Employee management (EMP-01). Held by Super Admin and, through the
  // Department Manager role, resolved to organization-wide visibility only
  // when the acting manager's own department is HR & Executive Officer - a
  // bespoke check in `EmployeesService`, not a new role or a per-department
  // branch in this catalog (see `EmployeesService.requireEmployeeAccess`).
  {
    key: "employee.read",
    description: "View employee profiles (HR-only data linked to a user).",
  },
  {
    key: "employee.create",
    description: "Register an employee profile, linking or creating a user.",
  },
  {
    key: "employee.update",
    description: "Update an employee profile's HR fields.",
  },
  {
    key: "employee.status.update",
    description: "Change an employee profile's employment status.",
  },

  // Administration: Letters and Documents. Held by Super Admin and, through
  // the Department Manager role, resolved to organization-wide visibility
  // only when the acting manager's own department is HR & Executive
  // Officer - the same bespoke `isHrExecutiveOfficerManager` check Employee
  // Management uses, not a new role or a per-department branch here.
  // `*.delete` is deliberately never granted below organization scope (no
  // DEPARTMENT-scope grant for it exists at all), the same "sensitive,
  // Super-Admin-only" idiom as `expense.approve`/`campaign.delete`.
  {
    key: "letter.read",
    description: "View incoming/outgoing correspondence and its attachments.",
  },
  {
    key: "letter.create",
    description: "Register a letter; the reference number is server-assigned.",
  },
  {
    key: "letter.update",
    description: "Edit a letter's fields. The reference number never changes.",
  },
  {
    key: "letter.delete",
    description: "Remove a letter. Super Admin only.",
  },
  {
    key: "letter.share",
    description: "Share a letter with an employee or with all employees.",
  },
  {
    key: "document.read",
    description: "View the document repository.",
  },
  {
    key: "document.create",
    description: "Upload a document, or register one from a letter attachment.",
  },
  {
    key: "document.update",
    description: "Rename a document or change its type.",
  },
  {
    key: "document.delete",
    description: "Remove a document. Super Admin only.",
  },
  {
    key: "document.share",
    description: "Share a document with an employee or with all employees.",
  },

  // Any authenticated active employee may read records explicitly shared
  // with them (directly, or via an active all-employees grant) - this is a
  // wholly separate authorization path from `letter.*`/`document.*` above
  // and never widens into the full management lists or operations.
  {
    key: "share.read",
    description:
      "Read letters and documents shared with the caller, directly or with all employees.",
  },

  // Attendance and Leave (ATT-01/ATT-02). `attendance.schedule.manage`,
  // `attendance.overtime.review`, `attendance.exception.review`,
  // `attendance.reports.read`, `leave.review`, and `leave.grant.manage` are
  // granted flatly to every Department Manager (DEPARTMENT scope) - the
  // same shape as every other bespoke-boundary module in this catalog.
  // `AttendanceAccessPolicy` resolves the precise reach at the service
  // layer: Super Admin reaches every employee (ORGANIZATION catch-all); the
  // HR & Executive Officer department's own manager also reaches every
  // employee, by department name, mirroring `isHrExecutiveOfficerManager`;
  // every other Department Manager reaches only their own department's
  // employees/shifts. Kiosk registration and leave-type policy are never
  // delegated to a Department Manager at all - Super Admin only.
  {
    key: "attendance.punch",
    description: "Check in or out for an assigned event shift via the mobile workflow.",
  },
  {
    key: "attendance.read",
    description: "View the caller's own attendance sessions and history.",
  },
  {
    key: "attendance.exception.create",
    description: "Raise a correction request for the caller's own attendance.",
  },
  {
    key: "attendance.schedule.manage",
    description: "Create and change event shifts and their employee assignments.",
  },
  {
    key: "attendance.overtime.review",
    description: "Approve or reject potential overtime on an attendance session.",
  },
  {
    key: "attendance.exception.review",
    description: "Approve or reject an attendance exception or correction request.",
  },
  {
    key: "attendance.reports.read",
    description: "View attendance dashboards and reports beyond the caller's own record.",
  },
  {
    key: "attendance.calendar.manage",
    description:
      "Configure the weekly work schedule and holiday calendar. Super Admin and the HR & Executive Officer department's manager only.",
  },
  {
    key: "attendance.kiosk.manage",
    description: "Register or revoke an office attendance kiosk. Super Admin only.",
  },
  {
    key: "leave.request.create",
    description: "Submit, withdraw, or amend the caller's own leave requests.",
  },
  {
    key: "leave.read",
    description: "View the caller's own leave balance, grants, and requests.",
  },
  {
    key: "leave.review",
    description: "Approve, reject, or return a leave request for changes.",
  },
  {
    key: "leave.grant.manage",
    description: "Grant or adjust an employee's leave balance.",
  },
  {
    key: "leave.type.manage",
    description: "Configure leave types and their policy. Super Admin only.",
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
  { permissionKey: "share.read", scope: "SELF" },
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
  { permissionKey: "attendance.punch", scope: "SELF" },
  { permissionKey: "attendance.read", scope: "SELF" },
  { permissionKey: "attendance.exception.create", scope: "SELF" },
  { permissionKey: "leave.request.create", scope: "SELF" },
  { permissionKey: "leave.read", scope: "SELF" },
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

const DEPARTMENT_MANAGER_GRANTS: readonly GrantDefinition[] = [
  // EOM-01: without this, a Department Manager cannot reach the
  // "management" dashboard audience at all (requireAudience gated it to
  // MANAGEMENT/ORGANIZATION only), so none of the operational-monitoring
  // cards below are reachable regardless of their own per-card scope.
  // Each existing card's own sourceScope(...) allow-list is unaffected by
  // this - only cards already listing "department" (or newly widened for
  // EOM-01) become visible; every organization-only card still denies.
  { permissionKey: "dashboard.management.read", scope: "DEPARTMENT" },
  { permissionKey: "department.read", scope: "DEPARTMENT" },
  { permissionKey: "department.manage_activities", scope: "DEPARTMENT" },
  { permissionKey: "team.read", scope: "DEPARTMENT" },
  { permissionKey: "task.create", scope: "DEPARTMENT" },
  { permissionKey: "task.read", scope: "DEPARTMENT" },
  { permissionKey: "task.assign", scope: "DEPARTMENT" },
  { permissionKey: "task.update", scope: "DEPARTMENT" },
  { permissionKey: "task.review", scope: "DEPARTMENT" },
  // TSK-CREATE: without this, a Department Manager could create and assign
  // a task but never attach a file to it - the create-task form's attachment
  // step needs the same department-scoped grant Super Admin already holds.
  { permissionKey: "task.attachment.create", scope: "DEPARTMENT" },
  // The full two-tier workflow requires every assignee tier to be able to
  // self-report, not just Department Member: Super Admin assigns a task to
  // a Department Manager, who must update its progress/status and submit it
  // back (to Super Admin, via the ORGANIZATION-scope `task.review` grant
  // already held there) - the same SELF-scope grants `TEAM_MEMBER_GRANTS`
  // already holds for the Member -> Manager tier. `TasksService.review()`
  // refuses self-review, so a Manager can never approve their own
  // submission - it genuinely has to reach Super Admin (or, for a task
  // under a different department, that department's own manager).
  { permissionKey: "task.update_status", scope: "SELF" },
  { permissionKey: "task.update_progress", scope: "SELF" },
  { permissionKey: "task.submit", scope: "SELF" },
  { permissionKey: "event.read", scope: "DEPARTMENT" },
  // Event & office management (EOM-01): the Event & Office Manager department
  // additionally manages its own events end to end, not just reads them.
  { permissionKey: "event.create", scope: "DEPARTMENT" },
  { permissionKey: "event.update", scope: "DEPARTMENT" },
  { permissionKey: "event.delete", scope: "DEPARTMENT" },
  { permissionKey: "event.assign_manager", scope: "DEPARTMENT" },
  { permissionKey: "event.assign_teams", scope: "DEPARTMENT" },
  { permissionKey: "event.transition_status", scope: "DEPARTMENT" },
  { permissionKey: "event.budget.read", scope: "DEPARTMENT" },
  { permissionKey: "event.budget.update", scope: "DEPARTMENT" },
  // Production department management (PROD-WS): the Production Department
  // Manager manages their own productions end to end - creation, updates,
  // lifecycle, and manager/team/talent assignment - mirroring the Event &
  // Office Manager's own `event.*` department grants above. These same
  // `project.*` keys are also used by the (deliberately organization-only)
  // general Projects module; that module always checks `ORGANIZATION` scope
  // regardless of what else is granted here, so this grant cannot widen
  // access to general projects.
  { permissionKey: "project.read", scope: "DEPARTMENT" },
  { permissionKey: "project.create", scope: "DEPARTMENT" },
  { permissionKey: "project.update", scope: "DEPARTMENT" },
  { permissionKey: "project.delete", scope: "DEPARTMENT" },
  { permissionKey: "project.assign", scope: "DEPARTMENT" },
  { permissionKey: "project.transition_status", scope: "DEPARTMENT" },
  { permissionKey: "production.budget.read", scope: "DEPARTMENT" },
  { permissionKey: "production.budget.update", scope: "DEPARTMENT" },
  // Marketing department management: a Marketing Department Manager plans
  // and executes campaigns end to end for their own department, mirroring
  // the Event & Office Manager's and Production Manager's own department
  // grants above. `campaign.delete` is deliberately withheld, matching how
  // supplier/partner records are status-managed rather than hard-deleted.
  { permissionKey: "campaign.read", scope: "DEPARTMENT" },
  { permissionKey: "campaign.create", scope: "DEPARTMENT" },
  { permissionKey: "campaign.update", scope: "DEPARTMENT" },
  { permissionKey: "campaign.assign", scope: "DEPARTMENT" },
  { permissionKey: "campaign.transition_status", scope: "DEPARTMENT" },
  { permissionKey: "campaign.activity.manage", scope: "DEPARTMENT" },
  { permissionKey: "campaign.budget.read", scope: "DEPARTMENT" },
  { permissionKey: "campaign.budget.update", scope: "DEPARTMENT" },
  // Sponsorships and partnerships (Marketing Department Workspace).
  { permissionKey: "partner.create", scope: "DEPARTMENT" },
  { permissionKey: "partner.read", scope: "DEPARTMENT" },
  { permissionKey: "partner.update", scope: "DEPARTMENT" },
  { permissionKey: "partner.activity.create", scope: "DEPARTMENT" },
  // Employee management (EMP-01). Granted generically here so a RolePermission
  // row exists for every Department Manager; `EmployeesService` is the real
  // boundary and only honors this grant when the acting manager's own
  // department is HR & Executive Officer, treating it as org-wide visibility
  // in that one case - every other Department Manager holds this grant but
  // it never resolves to anything, by that same service-layer check.
  { permissionKey: "employee.read", scope: "DEPARTMENT" },
  { permissionKey: "employee.create", scope: "DEPARTMENT" },
  { permissionKey: "employee.update", scope: "DEPARTMENT" },
  { permissionKey: "employee.status.update", scope: "DEPARTMENT" },
  // Administration: Letters and Documents - the identical generic-grant,
  // service-layer-enforced boundary as the employee.* grants just above.
  // `letter.delete`/`document.delete` are deliberately absent here: no
  // DEPARTMENT-scope grant for them exists anywhere, so only Super Admin's
  // organization-scope catch-all ever reaches them.
  { permissionKey: "letter.read", scope: "DEPARTMENT" },
  { permissionKey: "letter.create", scope: "DEPARTMENT" },
  { permissionKey: "letter.update", scope: "DEPARTMENT" },
  { permissionKey: "letter.share", scope: "DEPARTMENT" },
  { permissionKey: "document.read", scope: "DEPARTMENT" },
  { permissionKey: "document.create", scope: "DEPARTMENT" },
  { permissionKey: "document.update", scope: "DEPARTMENT" },
  { permissionKey: "document.share", scope: "DEPARTMENT" },
  { permissionKey: "meeting.create", scope: "DEPARTMENT" },
  { permissionKey: "meeting.read", scope: "DEPARTMENT" },
  { permissionKey: "meeting.update", scope: "DEPARTMENT" },
  { permissionKey: "channel.create", scope: "DEPARTMENT" },
  { permissionKey: "channel.manage", scope: "DEPARTMENT" },
  { permissionKey: "calendar.read", scope: "DEPARTMENT" },
  { permissionKey: "report.create", scope: "DEPARTMENT" },
  { permissionKey: "report.submit", scope: "DEPARTMENT" },
  { permissionKey: "report.read", scope: "DEPARTMENT" },
  { permissionKey: "report.attachment.create", scope: "DEPARTMENT" },
  {
    permissionKey: "analytics.department_performance.read",
    scope: "DEPARTMENT",
  },
  // Expenses and suppliers (EOM-01). `expense.approve` is deliberately never
  // granted here - it is Super-Admin-only via SUPER_ADMIN_GRANTS's catch-all,
  // the same "sensitive, approval-gated" idiom as `event.budget.*`.
  { permissionKey: "expense.create", scope: "DEPARTMENT" },
  { permissionKey: "expense.read", scope: "DEPARTMENT" },
  { permissionKey: "expense.update", scope: "DEPARTMENT" },
  { permissionKey: "expense.submit", scope: "DEPARTMENT" },
  { permissionKey: "expense.attachment.create", scope: "DEPARTMENT" },
  { permissionKey: "supplier.create", scope: "DEPARTMENT" },
  { permissionKey: "supplier.read", scope: "DEPARTMENT" },
  { permissionKey: "supplier.update", scope: "DEPARTMENT" },
  // Attendance and Leave (ATT-01/ATT-02). Granted flatly to every
  // Department Manager, like every other bespoke-boundary module above -
  // `AttendanceAccessPolicy` is what actually resolves a given manager's
  // real reach (their own department, or every department for the HR &
  // Executive Officer department's own manager) at the service layer.
  { permissionKey: "attendance.schedule.manage", scope: "DEPARTMENT" },
  { permissionKey: "attendance.overtime.review", scope: "DEPARTMENT" },
  { permissionKey: "attendance.exception.review", scope: "DEPARTMENT" },
  { permissionKey: "attendance.reports.read", scope: "DEPARTMENT" },
  // Flat grant like the others above - `AttendanceReviewService.requireHrOrSuperAdminAccess`
  // narrows it to just the HR & Executive Officer department's own manager,
  // the same boundary already used for `attendance.reports.read`'s detailed
  // sessions view.
  { permissionKey: "attendance.calendar.manage", scope: "DEPARTMENT" },
  // `leave.read` is required alongside `leave.review`/`leave.grant.manage`:
  // the `GET /leave/requests|grants|balance|calendar` routes gate on
  // `leave.read` at the transport boundary (`PermissionsGuard`), before the
  // service's own department/organization visibility-widening logic ever
  // runs. Without it a Department Manager cannot reach that logic at all.
  { permissionKey: "leave.read", scope: "DEPARTMENT" },
  { permissionKey: "leave.review", scope: "DEPARTMENT" },
  { permissionKey: "leave.grant.manage", scope: "DEPARTMENT" },
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
  { permissionKey: "report.attachment.create", scope: "SELF" },
  { permissionKey: "meeting.read", scope: "SELF" },
  // A team member may view and contribute to a partnership relationship
  // they are the assigned owner of, but not create, edit its core fields,
  // or browse the department's full commercial/sponsor directory.
  { permissionKey: "partner.read", scope: "SELF" },
  { permissionKey: "partner.activity.create", scope: "SELF" },
];

/**
 * The three approved platform roles, seeded as ordinary data - never a code
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
    name: "Department Manager",
    description: "Manages the work and reporting of one department.",
    grants: DEPARTMENT_MANAGER_GRANTS,
  },
  {
    name: "Department Member",
    description: "Works on assigned tasks and submits reports.",
    grants: TEAM_MEMBER_GRANTS,
  },
];
