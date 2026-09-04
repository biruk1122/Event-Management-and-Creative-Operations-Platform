# Navigation and information architecture

## Purpose and authority

This document defines the role-aware navigation model and route map for the Event Management and
Creative Operations Platform. It assigns a route owner to every destination in
[SRS](../requirements/software-requirements-specification.pdf) section 8 (Main Navigation Structure)
and sections 3 and 5, specifies responsive behavior, and defines what happens when a destination is
denied or unavailable.

The SRS remains the source of which destinations exist. This document reconciles their placement and
access without adding product behavior, and it builds on the canonical terms in
[`product-vocabulary-and-lifecycles.md`](product-vocabulary-and-lifecycles.md) and the permission
keys and scopes in
[`permission-catalog-and-role-matrix.md`](permission-catalog-and-role-matrix.md). The
[technical architecture](../architecture/technical-architecture.md) applies: Next.js App Router,
Server Components by default, URL state before a global store.

This document does not define final URL wire contracts, dynamic segment names, or visual design.
Each `*-04` UI/UX issue refines its own screens inside this frame, and each `*-02` API issue owns
its path contract. A row marked **open** is a `NAV-xx` decision that must be resolved before
implementation depends on it.

## Navigation model

### Surfaces

| Surface                    | Role                                                                   | Placement                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Primary navigation**     | The top-level destination list for the signed-in account.              | Persistent left sidebar on desktop; a collapsible icon rail on tablet; a bottom tab bar plus a full-screen drawer on mobile. |
| **Workspace tabs**         | Sections of one event, project, or campaign detail.                    | Horizontal tab bar under the workspace header; a scrollable segmented control or select on mobile.                           |
| **Section sub-navigation** | Views of one destination, for example task views.                      | Inline tabs or a segmented control at the top of the section.                                                                |
| **Utility navigation**     | Cross-cutting account affordances: notifications and the account menu. | Top bar, right-aligned; always reachable.                                                                                    |
| **Breadcrumbs**            | The path from a primary destination to the current nested page.        | Above the page title on detail and nested pages; a single back affordance plus the current title on mobile.                  |

- The top level is flat. At most one level of collapsible child items is allowed under a primary
  destination. **Nested mega-menus are not used at any breakpoint.**
- Navigation is composed from permission keys, never from literal role names. A destination the
  account cannot access is not rendered (see [Denied and unavailable](#denied-and-unavailable)).

### Audiences

The primary navigation is assembled per account from the permission keys it holds. Three shapes
result from the current role matrix; they are descriptions of the key sets, not hard-coded menus.

| Audience              | Typical roles                                             | Primary destinations                                                                                                                                                           |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Management**        | Super Admin, Management/Administrator, Department Manager | Dashboard, Discuss, Meetings, Calendar, To-Do, Events, Projects, Campaigns, Tasks, Talent, Teams, Reports, Analytics, plus Users, Roles, and Settings where the keys are held. |
| **Employee**          | Team Member                                               | Dashboard, Discuss, Meetings, Calendar, To-Do, Tasks, and read-only Events and Projects for records the account is assigned to.                                                |
| **Talent management** | Talent Manager                                            | Dashboard, Discuss, Meetings, Calendar, To-Do, Talent, and the talent schedule.                                                                                                |

Every audience also has the account menu (`/account`, Settings when permitted, sign out) and
Notifications.

## Route map

Paths are patterns. Dynamic segments (`[eventId]` and similar) and their exact names are fixed by
the owning module's data and API issues. "Owner" is the delivery epic that builds the destination.
"Requires" lists the governing permission key from the permission catalogue; the server enforces it
regardless of navigation visibility.

### Entry and account

| Destination           | Path              | Owner          | Nav group    | Requires                     | Notes                                                                   |
| --------------------- | ----------------- | -------------- | ------------ | ---------------------------- | ----------------------------------------------------------------------- |
| Sign in               | `/login`          | IAM            | none         | none                         | Unauthenticated only; an authenticated visit redirects to `/dashboard`. |
| Root                  | `/`               | EN             | none         | authenticated                | Redirects to `/dashboard`, or to `/login?next=/` when signed out.       |
| Account and profile   | `/account`        | USR            | account menu | baseline `profile.read`      | Own profile; edit via `profile.update`.                                 |
| Organization settings | `/settings`       | USR / platform | account menu | `settings.read`              | Super Admin.                                                            |
| Roles and permissions | `/settings/roles` | RBAC           | account menu | `role.read`                  | Super Admin.                                                            |
| Notifications         | `/notifications`  | NTF            | utility      | baseline `notification.read` | Bell in the top bar opens a panel; the page is the full history.        |

### Work and collaboration

| Destination               | Path                                                 | Owner | Nav group            | Requires                                                                              | Notes                                                                                                            |
| ------------------------- | ---------------------------------------------------- | ----- | -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dashboard                 | `/dashboard`                                         | DSH   | primary              | baseline `dashboard.read`                                                             | Role-aware: the management dashboard needs `dashboard.management.read`; otherwise the employee dashboard.        |
| Management analytics      | `/analytics`                                         | ANA   | primary (management) | `analytics.management.read`                                                           | Sensitive management data.                                                                                       |
| Discuss - direct messages | `/discuss/dm`, `/discuss/dm/[conversationId]`        | DSC   | primary              | baseline `conversation.read`                                                          |                                                                                                                  |
| Discuss - channels        | `/discuss/channels`, `/discuss/channels/[channelId]` | DSC   | primary              | baseline `channel.participate`                                                        | Channel creation needs `channel.create`.                                                                         |
| Meetings                  | `/meetings`, `/meetings/[meetingId]`                 | MTG   | primary              | baseline `meeting.read` for invited meetings                                          | Listed as its own destination; the SRS also nests it under Discuss - see NAV-03.                                 |
| Calendar                  | `/calendar`                                          | CAL   | primary              | baseline `calendar.read`                                                              | `?view=day\|week\|month\|agenda` and `?date=` are URL state, not routes.                                         |
| To-Do                     | `/todo`, `/todo/[category]`                          | TODO  | primary              | baseline `todo.read`                                                                  | Categories `my-day`, `important`, `upcoming`, `work`, `personal`, `completed` from the vocabulary catalogue.     |
| Tasks                     | `/tasks`, `/tasks/[view]`, `/tasks/[taskId]`         | TSK   | primary              | `task.read` at `self`; wider views need `task.read` at `department` or `organization` | Views `mine`, `all`, `board`, `calendar` (SRS 5.11). `all` is hidden without an org- or department-scoped grant. |

### Events, projects, and campaigns

| Destination         | Path                                          | Owner                 | Nav group                                | Requires                       | Notes                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------- | --------------------- | ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events list         | `/events`, `/events/calendar`                 | EVT                   | primary                                  | `event.read`                   | `?filter=upcoming` is URL state. Whether an assigned Team Member receives a scoped `event.read` is permission-catalogue `PC-11`.                                                                                                                           |
| Event workspace     | `/events/[eventId]/[tab]`                     | EVT + WSP             | breadcrumb child                         | `event.read` for the event     | Tabs below.                                                                                                                                                                                                                                                |
| Projects list       | `/projects`                                   | PRJ                   | primary                                  | `project.read`                 | The SRS navigation groups Production, Marketing, and Promotion here. Production routes to production projects; Marketing and Promotion route to the campaign lists below, because campaigns are owned by their own modules, not duplicate project records. |
| Production projects | `/projects/production`                        | PRD                   | primary child                            | `project.read`                 |                                                                                                                                                                                                                                                            |
| Project workspace   | `/projects/[projectId]/[tab]`                 | PRJ / PRD + WSP       | breadcrumb child                         | `project.read` for the project | Tabs below.                                                                                                                                                                                                                                                |
| Campaigns           | `/campaigns`, `/campaigns/[campaignId]/[tab]` | CAM / MKT / PRO + WSP | primary child (as Marketing / Promotion) | `campaign.read`                | Tabs below.                                                                                                                                                                                                                                                |
| Talent              | `/talent`, `/talent/[talentId]`               | TAL                   | primary                                  | `talent.read`                  |                                                                                                                                                                                                                                                            |
| Talent assignments  | `/talent/assignments`                         | TAL                   | primary child                            | `talent.read`                  | Cross-event assignment view for the Talent Manager.                                                                                                                                                                                                        |

### Organization and reporting

| Destination | Path                                                      | Owner | Nav group            | Requires                                                                                    | Notes                                                                                                                |
| ----------- | --------------------------------------------------------- | ----- | -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Users       | `/users`, `/users/[userId]`                               | USR   | primary (management) | `user.read`                                                                                 | User administration; open in NAV-06 whether Management/Administrator sees it.                                        |
| Departments | `/teams/departments`, `/teams/departments/[departmentId]` | DEP   | primary (management) | `department.read`                                                                           |                                                                                                                      |
| Teams       | `/teams`, `/teams/[teamId]`                               | TEAM  | primary (management) | `team.read`                                                                                 |                                                                                                                      |
| Reports     | `/reports/[period]`, `/reports/[reportId]`                | RPT   | primary              | `report.read` at `self` for own reports; wider scope for department or organization reports | Periods `daily`, `weekly`, `monthly`.                                                                                |
| Files       | `/files`                                                  | FIL   | primary (management) | `directory.read` plus a file grant                                                          | Most file access happens inside a workspace Files tab; this index is a management convenience and is open in NAV-05. |

### System

| Destination           | Path                  | Owner | Nav group | Requires | Notes                                               |
| --------------------- | --------------------- | ----- | --------- | -------- | --------------------------------------------------- |
| Backend health bridge | `/api/health/backend` | EN    | none      | none     | Existing infrastructure route; not user navigation. |

## Workspace tabs

Workspace tabs present records that other modules own; opening a tab is a filtered view, not a
transfer of ownership. A tab whose permission key the account lacks is not rendered.

| Workspace                          | Tabs                                                                                                        | Source (SRS)        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------- |
| Event `/events/[eventId]`          | `overview`, `details`, `teams`, `talent`, `tasks`, `calendar`, `discussion`, `meetings`, `files`, `reports` | 5.5 Event Workspace |
| Project `/projects/[projectId]`    | `overview`, `tasks`, `team`, `calendar`, `discussion`, `meetings`, `files`, `reports`                       | 5.10 Project        |
| Campaign `/campaigns/[campaignId]` | `overview`, `activities`, `tasks`, `calendar`, `discussion`, `team`, `reports`                              | 5.8, 5.9            |

- `overview` is the default tab and is available whenever the parent record is readable.
- Tab permission keys: `teams`/`team` -> `team.read`; `talent` -> `talent.read`; `tasks` ->
  `task.read`; `calendar` -> baseline `calendar.read`; `discussion` -> baseline
  `channel.participate`; `meetings` -> baseline `meeting.read`; `files` -> a file grant;
  `reports` -> `report.read`; `activities` -> `campaign.activity.manage` to edit, `campaign.read`
  to view.

## Responsive behavior

Layout is mobile-first. Essential actions are never hidden behind hover.

| Breakpoint                | Primary navigation                                                                                                                                        | Workspace tabs                                                                           | Breadcrumbs                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Mobile** (`< 640px`)    | Bottom tab bar with four or five high-use destinations (NAV-07) plus a **More** item that opens a full-screen drawer listing every permitted destination. | Horizontal scrollable segmented control, or a select when there are more than five tabs. | Collapse to a back affordance and the current page title. |
| **Tablet** (`640-1023px`) | Icon rail by default; expands to an overlay with labels on toggle.                                                                                        | Horizontal tab bar; scrolls when it overflows.                                           | Full breadcrumb trail above the title.                    |
| **Desktop** (`>= 1024px`) | Persistent sidebar with icon and label; collapsible to an icon rail, choice persisted per account.                                                        | Horizontal tab bar.                                                                      | Full breadcrumb trail above the title.                    |

Accessibility (WCAG 2.2 AA):

- Primary navigation is a `nav` landmark labelled "Primary"; utility navigation is labelled
  separately. A skip link jumps to the main content.
- The active destination carries `aria-current="page"`. Collapsible groups expose expanded state and
  are operable by keyboard.
- The mobile drawer traps focus while open and restores focus to the trigger on close.
- Targets are at least 24 by 24 CSS pixels; focus is always visible; the layout respects
  `prefers-reduced-motion`.
- Tab order follows visual order. Route changes move focus to the page heading and announce the new
  page title.

## Denied and unavailable

| Situation                             | Behavior                                                                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not permitted**                     | The destination is omitted from every navigation surface. Navigation visibility is a convenience only; the Server Component still checks the permission on load.                                                           |
| **Denied direct navigation**          | A permitted-looking URL that the account cannot access renders a `403` page ("You do not have access to this area") with a link back to `/dashboard`. The app does not silently redirect and does not render a blank page. |
| **Unauthenticated**                   | Any protected route redirects to `/login?next=<pathname>`. After a successful sign in the account returns to `next` when it is an allowed in-app path it may access, otherwise to `/dashboard` (allow-listing in NAV-08).  |
| **Session no longer valid**           | A request that fails authentication (logout elsewhere, revocation, deactivation) redirects to `/login` with a brief explanation; entered form data is preserved where recoverable.                                         |
| **Unknown route**                     | The existing `not-found` page renders a `404` with primary navigation intact.                                                                                                                                              |
| **Module not deployed yet**           | The destination is absent from navigation and a deep link renders `404`. Navigation never shows a destination whose module is not built.                                                                                   |
| **Deployed but temporarily disabled** | Either a disabled navigation item with an explanatory tooltip, or a "temporarily unavailable" page; the choice is NAV-04.                                                                                                  |
| **Permitted but empty**               | An empty state with a primary action and guidance. An empty state is never presented as a denial.                                                                                                                          |

## Open navigation decisions

| ID     | Decision required                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| NAV-01 | Whether a global search is a top-bar affordance from launch, its scope, and its result routing.                          |
| NAV-02 | Final dynamic segment naming: opaque id versus human-readable slug for events, projects, campaigns, talent, and reports. |
| NAV-03 | Whether Meetings is a top-level destination, a child of Discuss, or both, and how it appears in the mobile bottom bar.   |
| NAV-04 | The treatment for a deployed-but-disabled destination: disabled nav item with tooltip, or a dedicated unavailable page.  |
| NAV-05 | Whether a management-level `/files` index exists in addition to per-workspace Files tabs.                                |
| NAV-06 | Whether Management/Administrator sees `/users` and `/settings/roles`, tracked with permission-catalogue `PC-02`.         |
| NAV-07 | The exact four or five mobile bottom-bar destinations per audience.                                                      |
| NAV-08 | The allow-list of `next` targets accepted after sign in.                                                                 |
| NAV-09 | Whether Campaigns appears as its own top-level destination or only inside the Projects group as Marketing and Promotion. |
| NAV-10 | Breadcrumb behavior for cross-linked records (a task opened from an event workspace versus from `/tasks`).               |

## SRS traceability

| SRS area                                                       | Route-map coverage                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 3 System Scope (module tree)                                   | Every module has a primary destination or a workspace tab in the route map.                      |
| 4 Dashboard, 5.1 Management and Employee dashboards            | `/dashboard`, role-aware; `/analytics` for management analytics.                                 |
| 5.2-5.4 User, Department, Team management                      | `/users`, `/teams/departments`, `/teams`.                                                        |
| 5.5 Event Management and Event Workspace                       | `/events`, `/events/calendar`, `/events/[eventId]/[tab]` with the ten workspace tabs.            |
| 5.6 Talent Management                                          | `/talent`, `/talent/[talentId]`, `/talent/assignments`.                                          |
| 5.7-5.9 Production, Promotion, Marketing                       | `/projects/production`, `/campaigns` surfaced as Marketing and Promotion, with workspace tabs.   |
| 5.10-5.11 Project and Task Management                          | `/projects`, `/projects/[projectId]/[tab]`, `/tasks/[view]`, `/tasks/[taskId]`.                  |
| 5.12-5.13 Discuss and Meetings                                 | `/discuss/dm`, `/discuss/channels`, `/meetings`.                                                 |
| 5.14-5.15 Calendar and To-Do                                   | `/calendar` with view URL state; `/todo/[category]`.                                             |
| 5.17 Notifications                                             | `/notifications` plus the top-bar panel.                                                         |
| 5.18 Reporting                                                 | `/reports/[period]`, `/reports/[reportId]`.                                                      |
| 8 Main Navigation Structure                                    | Each top-level entry and its children map to a primary destination and its collapsible children. |
| 10-11 Recommended architecture and non-functional requirements | Mobile-first hierarchy, no nested mega-menus, WCAG 2.2 AA, permission-aligned route visibility.  |
