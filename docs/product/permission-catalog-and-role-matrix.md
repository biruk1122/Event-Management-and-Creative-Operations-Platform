# Permission catalog and role matrix

## Purpose and authority

This catalog defines the canonical permission keys and the role-to-permission matrix for the Event
Management and Creative Operations Platform. It translates the role abilities in
[SRS](../requirements/software-requirements-specification.pdf) section 4 into stable, configurable
authorization units so that access control is enforced consistently across the API, real-time
gateway, and any future transport.

The SRS remains the source of product requirements. This document reconciles its role language
without adding business behavior, and it builds on the canonical role terms and scope vocabulary in
[`product-vocabulary-and-lifecycles.md`](product-vocabulary-and-lifecycles.md). The
[technical architecture](../architecture/technical-architecture.md) still applies: authentication
and authorization are enforced at transport and application-service boundaries, and a record has one
concrete owning module.

This document does not define database column names, API wire formats, guard class names, or seed
migrations. Those are approved as part of the issue that implements Role-Based Access Control
(RBAC). A permission key listed here is the enforcement vocabulary; a grant marked **open** is not
permission to invent policy and must be resolved before implementation depends on it. The words
**shall**, **should**, and **may** retain their SRS meanings.

## Authorization model

- **Permission key.** A `resource.action` string naming one authorized operation, for example
  `task.review` or `role.configure_permissions`. Keys are scope-free.
- **Scope.** A qualifier applied to each grant that bounds the records the grant covers:
  `organization`, `department`, `team`, `workspace`, `self`, or `management`. `workspace` means the
  connected workspace of one event, project, or campaign the user manages or is assigned to.
  `management` marks data that is only ever exposed to organization-wide management roles.
- **Grant.** A `(role, permission key, scope)` triple. A role's effective permissions are the union
  of its grants. A future role is defined entirely by its set of grants.
- **Deny by default.** A request is authorized only when the acting user holds a grant whose
  permission key covers the operation and whose scope covers the target record. Absence of a grant
  is denial. There is no implicit inheritance between roles.
- **Two-boundary enforcement.** Every operation is checked in the transport guard and again in the
  application service that performs it. User interface visibility is never authorization, and role
  names are never used as authorization in code.
- **Scope resolution.** Guards resolve `department`, `team`, `workspace`, and `self` from the acting
  user's assignments and the target record, not from client input. The precise resolution rules are
  open in [PC-01](#open-authorization-decisions).

## Permission catalog

Keys are grouped by resource. Every key traces to one or more SRS abilities; see
[SRS traceability](#srs-traceability).

### Identity and access administration

| Key                          | Operation                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `user.create`                | Create a user account.                                           |
| `user.read`                  | View user accounts and their role, department, and status.       |
| `user.update`                | Update user account fields.                                      |
| `user.deactivate`            | Deactivate a user (User access `Active -> Inactive`).            |
| `user.assign_role`           | Assign or change a user's role.                                  |
| `user.assign_department`     | Assign or change a user's department.                            |
| `user.assign_team`           | Add or remove a user from a team.                                |
| `user.manage_status`         | Change a user's status other than through deactivation.          |
| `role.create`                | Create a configurable role.                                      |
| `role.read`                  | View roles and their grants.                                     |
| `role.update`                | Rename or describe a role.                                       |
| `role.delete`                | Remove a role that is not in use.                                |
| `role.configure_permissions` | Add or remove permission grants on a role.                       |
| `settings.read`              | View organization system settings.                               |
| `settings.update`            | Change organization system settings.                             |
| `audit.read`                 | Read the security and governance audit log.                      |
| `activity.read`              | Read cross-module activity history beyond the acting user's own. |

### Profile and personal surface

| Key                         | Operation                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `profile.read`              | View one's own full profile.                                              |
| `profile.update`            | Update approved fields on one's own profile.                              |
| `directory.read`            | View other users' name, role, and department for assignment and @mention. |
| `dashboard.read`            | View the dashboard for one's own role.                                    |
| `dashboard.management.read` | View the management dashboard and its organization-wide overview.         |
| `notification.read`         | View and mark one's own notifications.                                    |

### Organization structure

| Key                            | Operation                                        |
| ------------------------------ | ------------------------------------------------ |
| `department.create`            | Create a department.                             |
| `department.read`              | View a department and its composition.           |
| `department.update`            | Update department fields.                        |
| `department.delete`            | Remove a department that is not in use.          |
| `department.assign_manager`    | Set or change a department's manager.            |
| `department.manage_activities` | Manage the work items owned by a department.     |
| `team.create`                  | Create a team.                                   |
| `team.read`                    | View a team and its members.                     |
| `team.update`                  | Update team fields.                              |
| `team.delete`                  | Remove a team that is not in use.                |
| `team.assign_manager`          | Set or change a team's manager.                  |
| `team.manage_members`          | Add or remove team members.                      |
| `team.assign_to_work`          | Assign a team to an event, project, or campaign. |

### Events

| Key                       | Operation                                                |
| ------------------------- | -------------------------------------------------------- |
| `event.create`            | Create an event.                                         |
| `event.read`              | View an event and its workspace.                         |
| `event.update`            | Update event fields.                                     |
| `event.delete`            | Remove an event. Delete versus archive is open in PC-03. |
| `event.assign_manager`    | Assign the event manager.                                |
| `event.assign_teams`      | Assign teams to an event.                                |
| `event.transition_status` | Move an event through its approved lifecycle states.     |
| `event.budget.read`       | View an event budget. Sensitive; see PC-04.              |
| `event.budget.update`     | Set or change an event budget. Sensitive; see PC-04.     |

### Projects and campaigns

| Key                          | Operation                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `project.create`             | Create a general or production project.                          |
| `project.read`               | View a project, including its progress.                          |
| `project.update`             | Update project fields.                                           |
| `project.delete`             | Remove a project. Delete versus archive is open in PC-03.        |
| `project.assign`             | Assign a manager or team to a project.                           |
| `project.transition_status`  | Move a project through its approved lifecycle states.            |
| `campaign.create`            | Create a marketing or promotion campaign.                        |
| `campaign.read`              | View a campaign, including its progress.                         |
| `campaign.update`            | Update campaign fields, including marketing strategy.            |
| `campaign.delete`            | Remove a campaign. Delete versus archive is open in PC-03.       |
| `campaign.assign`            | Assign a manager or team to a campaign.                          |
| `campaign.transition_status` | Move a campaign through its approved lifecycle states.           |
| `campaign.budget.read`       | View a campaign budget. Sensitive; see PC-04.                    |
| `campaign.budget.update`     | Set or change a campaign budget. Sensitive; see PC-04.           |
| `campaign.activity.manage`   | Create and manage campaign, promotion, and marketing activities. |

### Talent

| Key                        | Operation                                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| `talent.create`            | Create a talent profile.                                               |
| `talent.read`              | View talent profiles and schedules.                                    |
| `talent.update`            | Update talent profile fields, including availability.                  |
| `talent.transition_status` | Move talent through its approved availability states.                  |
| `talent.assign`            | Assign talent to an event, project, campaign, or promotional activity. |
| `talent.manage_activities` | Manage talent activities and engagements.                              |

### Tasks and collaboration

| Key                      | Operation                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| `task.create`            | Create a task.                                                            |
| `task.read`              | View a task.                                                              |
| `task.update`            | Update task fields other than lifecycle state and progress.               |
| `task.assign`            | Add or remove assigned users on a task.                                   |
| `task.update_status`     | Change a task's lifecycle state within an assignee's allowed transitions. |
| `task.update_progress`   | Update a task's progress percentage.                                      |
| `task.submit`            | Move an assigned task to Under Review.                                    |
| `task.review`            | Record Approved or Changes Requested while a task is Under Review.        |
| `task.comment.create`    | Add a comment to a task.                                                  |
| `task.attachment.create` | Attach a managed file to a task.                                          |
| `message.send`           | Send a direct, group, or channel message.                                 |
| `conversation.create`    | Start a direct or group conversation.                                     |
| `conversation.read`      | Read a conversation the user is a member of.                              |
| `channel.create`         | Create a channel, including event, project, and department channels.      |
| `channel.manage`         | Manage a channel's membership and settings.                               |
| `channel.participate`    | Join and post in a channel the user is authorized to access.              |

### Meetings, calendar, and personal work

| Key               | Operation                                                     |
| ----------------- | ------------------------------------------------------------- |
| `meeting.create`  | Create and schedule a meeting.                                |
| `meeting.read`    | View a meeting the user organizes or is invited to.           |
| `meeting.update`  | Update or move a meeting the user organizes.                  |
| `meeting.respond` | Record a Pending, Accepted, or Declined participant response. |
| `calendar.read`   | View calendar data within scope.                              |
| `todo.create`     | Create a personal To-Do item.                                 |
| `todo.read`       | View one's own To-Do items.                                   |
| `todo.update`     | Update one's own To-Do items.                                 |
| `todo.delete`     | Delete one's own To-Do items.                                 |

### Reporting and analytics

| Key                                     | Operation                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| `report.create`                         | Create a report draft.                                    |
| `report.submit`                         | Submit a report for review.                               |
| `report.read`                           | Read reports within scope.                                |
| `report.review`                         | Move a submitted report to Reviewed or Changes Requested. |
| `analytics.management.read`             | View management analytics. Sensitive.                     |
| `analytics.department_performance.read` | View department performance measures. Sensitive.          |
| `analytics.employee_performance.read`   | View employee performance measures. Sensitive.            |

## Baseline grants for every authenticated user

Independent of role, an authenticated active user holds: `profile.read` and `profile.update` at
`self`; `directory.read` at `organization`; `dashboard.read`, `notification.read`, `calendar.read`,
`todo.create`, `todo.read`, `todo.update`, and `todo.delete` at `self`; `meeting.respond` at `self`;
`message.send` and `conversation.create` at `self`; and `conversation.read` and `channel.participate`
for conversations and channels they are a member of. These grants never expose another user's private
data and are additive to the role matrix below.

## Role matrix

Each role section lists only the grants that role holds, in addition to the
[baseline grants](#baseline-grants-for-every-authenticated-user). Any key and scope not listed is
denied for that role, since there is no inheritance between roles. Roles are the five named in SRS
section 4; they are seed data, not code branches.

### Super Admin

Holds every permission key in this catalog at `organization` scope. This is expressed as an explicit
set of grants in seed data, not a code-level bypass; the representation choice is open in
[PC-08](#open-authorization-decisions). Includes `user.*`, `role.*`, `settings.*`, `audit.read`,
`activity.read`, and all operational and reporting keys.

### Management / Administrator

| Permission key                                                                                                                     | Scope        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `event.create`, `event.read`, `event.update`, `event.assign_manager`, `event.assign_teams`, `event.transition_status`              | organization |
| `event.budget.read`, `event.budget.update`                                                                                         | organization |
| `project.create`, `project.read`, `project.update`, `project.assign`, `project.transition_status`                                  | organization |
| `campaign.create`, `campaign.read`, `campaign.update`, `campaign.assign`, `campaign.transition_status`, `campaign.activity.manage` | organization |
| `campaign.budget.read`, `campaign.budget.update`                                                                                   | organization |
| `team.assign_to_work`                                                                                                              | organization |
| `task.create`, `task.read`, `task.assign`, `task.update`, `task.review`                                                            | organization |
| `meeting.create`, `meeting.read`, `meeting.update`                                                                                 | organization |
| `channel.create`, `channel.manage`                                                                                                 | organization |
| `report.read`, `report.review`                                                                                                     | organization |
| `analytics.management.read`, `analytics.department_performance.read`, `analytics.employee_performance.read`                        | management   |
| `dashboard.management.read`                                                                                                        | management   |
| `activity.read`                                                                                                                    | organization |

Management does not hold `user.*`, `role.*`, `settings.*`, `*.delete`, or `audit.read` in this
matrix. Whether Management may administer users or roles is open in
[PC-02](#open-authorization-decisions); delete versus archive is open in
[PC-03](#open-authorization-decisions); audit read is open in
[PC-05](#open-authorization-decisions).

### Department Manager

| Permission key                                           | Scope      |
| -------------------------------------------------------- | ---------- |
| `department.read`, `department.manage_activities`        | department |
| `team.read`                                              | department |
| `task.create`, `task.read`, `task.assign`, `task.update` | department |
| `task.review`                                            | department |
| `event.read`, `project.read`, `campaign.read`            | department |
| `meeting.create`, `meeting.read`, `meeting.update`       | department |
| `channel.create`, `channel.manage`                       | department |
| `calendar.read`                                          | department |
| `report.create`, `report.submit`                         | department |
| `report.read`                                            | department |
| `analytics.department_performance.read`                  | department |

`department` scope is the acting user's assigned department. Multi-department and cross-department
behavior is open in [PC-01](#open-authorization-decisions). Whether a Department Manager may read
budgets for their department's work is open in [PC-04](#open-authorization-decisions).

### Team Member / Employee

| Permission key                                  | Scope |
| ----------------------------------------------- | ----- |
| `task.read`                                     | self  |
| `task.update_status`, `task.update_progress`    | self  |
| `task.submit`                                   | self  |
| `task.comment.create`, `task.attachment.create` | self  |
| `report.create`, `report.submit`                | self  |
| `report.read`                                   | self  |
| `meeting.read`                                  | self  |

`self` scope means records the user is assigned to, authored, or was invited to. A Team Member holds
no grant for any key in [Sensitive management data](#sensitive-management-data). This is the SRS
requirement that employees shall not access sensitive management information unless authorized.

### Talent / Artist Manager

| Permission key                                                              | Scope        |
| --------------------------------------------------------------------------- | ------------ |
| `talent.create`, `talent.read`, `talent.update`, `talent.transition_status` | organization |
| `talent.assign`, `talent.manage_activities`                                 | organization |
| `calendar.read`                                                             | organization |

`organization` scope here is bounded to the talent domain: talent records, talent schedules, and the
assignment relationships between talent and events, projects, campaigns, and promotional activities.
It does not grant read or write access to event, project, campaign, task, or report records. Whether
the Talent Manager may create tasks or channels for talent activities is open in
[PC-06](#open-authorization-decisions).

### Entity manager assignments

A user assigned as the manager of a specific event, project, campaign, or team is not a separate
role. It confers a defined set of keys at `workspace` scope for that record only. The exact key set
and whether it is modeled as a grant or as a distinct assignment concept is open in
[PC-07](#open-authorization-decisions).

## Sensitive management data

The following keys expose organization-wide management information. They are granted only to Super
Admin and, where shown, Management / Administrator, and are never part of the baseline or of the
Team Member or Talent Manager matrix. Every listed operation is denied unless the acting user holds
the specific key at the required scope.

| Sensitive area                     | Gating key                                                    | Roles with access                                              |
| ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Organization-wide task visibility  | `task.read` at `organization`                                 | Super Admin, Management                                        |
| All reports across departments     | `report.read` at `organization`                               | Super Admin, Management                                        |
| Reports across one department      | `report.read` at `department`                                 | Department Manager (own department)                            |
| Department performance measures    | `analytics.department_performance.read`                       | Super Admin, Management; Department Manager for own department |
| Employee performance measures      | `analytics.employee_performance.read`                         | Super Admin, Management                                        |
| Management analytics               | `analytics.management.read`                                   | Super Admin, Management                                        |
| Management dashboard               | `dashboard.management.read`                                   | Super Admin, Management                                        |
| Event and campaign budgets         | `event.budget.read`, `campaign.budget.read`                   | Super Admin, Management; others open in PC-04                  |
| System settings                    | `settings.read`, `settings.update`                            | Super Admin                                                    |
| Roles and permission configuration | `role.read`, `role.configure_permissions`, and other `role.*` | Super Admin                                                    |
| User administration                | `user.*`                                                      | Super Admin; Management open in PC-02                          |
| Security and governance audit log  | `audit.read`                                                  | Super Admin; Management open in PC-05                          |
| Cross-user activity history        | `activity.read`                                               | Super Admin, Management                                        |

## Configurability

The acceptance criterion that future roles can be added without code changes is met as follows.

- **Permission keys are a fixed enforcement vocabulary.** Each key corresponds to an authorization
  check in a guard and an application service. Adding a genuinely new key requires code because
  something must enforce it. The key set in this catalog is intended to be complete for the SRS
  scope; new keys are added only when a new authorized operation is introduced by a later issue.
- **Roles and their grants are data.** A role is a `Role` record; its access is a set of
  `(permission key, scope)` grants stored as data, consistent with the SRS `Role` and `Permission`
  entities. Creating a role, renaming it, or changing what it can do is a data change through
  `role.create`, `role.update`, and `role.configure_permissions`. No deployment is required.
- **Scope rules are data.** The scope attached to each grant, and the parameters of scope
  resolution, are configuration rather than compiled logic. The resolution engine itself is open in
  [PC-01](#open-authorization-decisions).
- **No role-name logic.** Guards and services resolve the acting user's grants from their role
  assignments. Code must never branch on a literal role name such as `Super Admin`. The five SRS
  roles are seeded as ordinary `Role` records.
- **Super Admin.** Modeled as an explicit full set of grants in seed data so that it obeys the same
  resolution path as every other role. A superuser bypass flag is the alternative and is open in
  [PC-08](#open-authorization-decisions).

## Enforcement rules

- Authorize in the transport guard and again in the application service. Neither boundary may be
  skipped because the other exists.
- Deny by default. Map an authorization failure to a stable Problem Details code without disclosing
  whether the target record exists when that itself is sensitive.
- Resolve scope from server-side assignment data and the target record, never from client-supplied
  role, department, or scope values.
- User interface visibility, route registration, and navigation entries are presentation only and
  carry no authorization weight.
- Real-time gateway events use the same permission keys and scope checks as the equivalent REST
  operations.
- Record authorization-relevant administrative actions for the audit log defined by EN-07
  (`audit.read` governs who may read it).

## Open authorization decisions

| ID    | Decision required                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC-01 | Define scope resolution: how `department`, `team`, `workspace`, and `self` are computed per request; single versus multiple department assignment; cross-department delegation.                             |
| PC-02 | Decide whether Management / Administrator may perform `user.*` and `role.*` operations, or whether those remain exclusive to Super Admin. SRS 5.2 says "authorized administrators" without naming the role. |
| PC-03 | Decide whether events, projects, and campaigns are deleted or archived, and which roles may do so. Coordinate with EVE-30 open decisions OD-02 and OD-03.                                                   |
| PC-04 | Define budget visibility for Department Managers and for assigned event, project, and campaign managers.                                                                                                    |
| PC-05 | Decide audit-log read access for Management and Department Manager roles. Coordinate with EN-07 (EVE-33).                                                                                                   |
| PC-06 | Define the Talent Manager boundary: whether the role may create tasks, channels, or meetings for talent activities, or only manage talent records and assignments.                                          |
| PC-07 | Define the entity-manager assignment: its `workspace`-scoped key set, and whether it is a grant or a separate assignment concept, for event, project, campaign, and team managers.                          |
| PC-08 | Decide the Super Admin representation: an explicit full grant set in seed data versus a superuser bypass flag.                                                                                              |
| PC-09 | Define which profile fields a Team Member may change through `profile.update` on their own account.                                                                                                         |
| PC-10 | Confirm the contents of `directory.read`: the minimum user attributes visible to every authenticated user for assignment and mentions.                                                                      |

## SRS traceability

| SRS area                                  | Catalog coverage                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| 4 User Roles and Permissions (intro)      | Authorization model; deny-by-default; configurability; five seeded roles                  |
| 4.1 Super Admin                           | Super Admin section; identity and access administration keys; sensitive management data   |
| 4.2 Management / Administrator            | Management / Administrator matrix; analytics and reporting keys; PC-02, PC-03, PC-05      |
| 4.3 Department Manager                    | Department Manager matrix; `department` scope; PC-01, PC-04                               |
| 4.4 Team Member / Employee                | Team Member matrix; baseline grants; sensitive management data exclusion                  |
| 4.5 Talent / Artist Manager               | Talent Manager matrix; talent keys; PC-06                                                 |
| 5.2 User Management                       | `user.*` keys; `user.deactivate` mapped to the User access lifecycle                      |
| 5.1.1 Management Dashboard                | `dashboard.management.read`; `analytics.*` keys; `management` scope                       |
| 5.11 Task Management, 5.16 Collaboration  | Task and collaboration keys; `task.review` mapped to the Task lifecycle review outcomes   |
| 5.13 Meeting Management                   | `meeting.*` keys; `meeting.respond` mapped to the participant response lifecycle          |
| 5.18 Reporting Module                     | `report.*` keys; `report.review` mapped to the Report lifecycle                           |
| 6 Database Entities (Role, Permission)    | Configurability: roles and grants as data                                                 |
| 11 Non-Functional Requirements (Security) | Enforcement rules: guard and application-service checks, permission checks, audit logging |
