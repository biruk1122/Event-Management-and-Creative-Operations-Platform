# Lela screen and state inventory

## Scope

EVE-215 inventory of shipped `apps/web/src/app/**/page.tsx` surfaces at base
`8c46ffb`. URLs below are implementation paths, not proposed replacements from
the older navigation document. Detail forms often live in dialogs on the same
route; do not assume a dedicated detail URL exists.

All rows receive the EVE-215 brand foundation and EVE-216 shared shell where
authenticated. EVE-228 owns final reconciliation and all-role validation. This
document records coverage, not completed styling or verified authorization.

## Route-to-delivery mapping

| Shipped route                        | Feature directory                  | Key surfaces/states to retain                                                                               | Styling owner                       |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `/`                                  | `foundation` and module navigation | Existing link-list entry, health/foundation content; approved dashboard redirect is separate work           | EVE-218                             |
| `/login`                             | `auth`                             | Email/password, busy, invalid credentials, safe next and session feedback                                   | EVE-217                             |
| `/dashboard`                         | `dashboards`                       | Management/employee variants, 30 catalog cards, scope/period, busy refresh, empty/error/retry               | EVE-220                             |
| `/analytics`                         | `analytics`                        | Measures, filter draft/applied/reset, pagination, KPI/panel/table states, denied measures, real-data charts | EVE-221                             |
| `/reports`                           | `reports`                          | Daily/weekly/monthly filters, list, draft form, detail, submit/review, export and scoped states             | EVE-219                             |
| `/users`                             | `users`                            | Filters, paginated table, create/detail dialogs, role assignment, active/password-pending states            | EVE-222                             |
| `/settings/roles`                    | `rbac`                             | Role table/create/detail, permission grants/scope editor, protected-role restrictions                       | EVE-222                             |
| `/departments`                       | `departments`                      | Filters, table, create/detail, manager assignment and confirmation/errors                                   | EVE-222                             |
| `/teams`                             | `teams`                            | Filters, table, create/detail, department ownership, manager/member controls                                | EVE-222                             |
| `/workspaces`                        | `workspaces`                       | Kind filters, list/create/detail, participant/file surfaces and scoped availability                         | EVE-223                             |
| `/events`                            | `events`                           | Filters, table, create/detail, status, manager/teams, budget only when permitted                            | EVE-223                             |
| `/projects`                          | `projects`                         | Filters, table, create/detail, status, manager/team assignment and connected workspace                      | EVE-223                             |
| `/tasks`                             | `tasks`                            | Existing task views/forms/actions, assignment, due/status/priority, filtered and empty data                 | EVE-223                             |
| `/talent`                            | `talent`                           | Filters, table, profile/create/detail, supported assignments and conflict feedback                          | EVE-224                             |
| `/projects/production`               | `productions`                      | Production board, form, resources/assignment/status and validation                                          | EVE-224                             |
| `/campaigns`                         | `campaigns`                        | Marketing/promotion types, filters, table/create/detail, activities and connected actions                   | EVE-225                             |
| `/discuss/dm/[[...conversationId]]`  | `discuss`                          | Conversation list/detail, composer, new conversation, unread/mentions and reconnect                         | EVE-226                             |
| `/discuss/channels/[[...channelId]]` | `discuss`                          | Channel list/detail/create, member dialog, composer and realtime feedback                                   | EVE-226                             |
| `/notifications`                     | `notifications`                    | Full history, filters, unread/read actions, pagination and panel/bell integration                           | EVE-226; EVE-216 header integration |
| `/calendar`                          | `calendar`                         | Month/week/day/agenda, date/view controls, entry/create/detail, overlap/conflict states                     | EVE-227                             |
| `/meetings`                          | `meetings`                         | Schedule/list/detail, participants, supported meeting/invitation actions                                    | EVE-227                             |
| `/todos`                             | `todo`                             | Smart views/categories, toolbar, list/form, completion, due/overdue and privacy                             | EVE-227                             |

The catch-all notation means the existing route supports an optional selected
conversation/channel identifier; it is not literal text to place in a link.

`/account`, `/settings`, `/files`, `/todo`, `/teams/departments`, dedicated report
period/detail routes and other planned record/tab URLs are not standalone pages
in this snapshot. Never add shell links to them merely because an older planning
document lists them. Use actual implemented destinations and permission checks.
`/api/health/backend` is an infrastructure endpoint, not a navigation screen.

## Nested surfaces without standalone routes

| Embedded surface            | Owning entry / implementation                                                                                          | Styling owner   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------- |
| Event files                 | `/events`, `files/components/event-files-panel.tsx`; upload/finalize/download, read-only and scanner/error feedback    | EVE-223         |
| Talent event assignments    | `/talent`, `talent/components/talent-event-assignments.tsx`; assignment lifecycle/conflicts                            | EVE-224         |
| Marketing strategy/board    | `/campaigns`, `marketing/components/marketing-strategy-panel.tsx` and `marketing-strategy-board.tsx`                   | EVE-225         |
| Promotion operations        | `/campaigns`, `promotion/components/promotion-operations-panel.tsx`; existing operations and lifecycle actions         | EVE-225         |
| Notification bell/panel     | Existing notification utilities plus future shared header; unread/read/session states                                  | EVE-216/EVE-226 |
| Realtime reconnect feedback | Shared `realtime` infrastructure consumed by Discuss, notifications and dashboards; do not create a new product screen | EVE-226/EVE-220 |

Dialog-local detail/assignment surfaces and supported create/edit/status actions
belong to the same styling owner as their entry route. Inspect those components
when implementing each batch; the route map alone is not complete state coverage.

## Cross-cutting state matrix

Apply this matrix to every applicable route and nested form/dialog, not only the
default screenshot. Use real authorized and denied fixtures in final validation.

| State                                  | Visual and interaction requirement                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Checking permissions / initial loading | Useful labelled progress without exposing unauthorized records or shifting focus     |
| Ready                                  | Clear heading, hierarchy, permitted actions and scope/period/context                 |
| Empty / filtered empty                 | Distinguish no records from no filter matches; suggest a supported action/reset      |
| Input invalid                          | Plain-language field error, associated control and preserved recoverable input       |
| Mutation pending                       | Busy feedback, duplicate-action prevention and stable focus                          |
| Mutation success                       | Clear confirmation without relying only on color                                     |
| API/network error                      | Distinguish failure from empty results; meaningful retry where supported             |
| Unauthorized / forbidden               | Preserve current auth handling and server enforcement; no cached-data leak           |
| Session or grants changed              | Remove stale protected content/navigation and preserve safe recovery behavior        |
| Dialog/drawer open                     | Accessible title, focus trap/restoration, Escape and mobile scrolling                |
| Long content / many records            | Wrapping, bounded pagination, readable tables/boards and explicit overflow treatment |
| Realtime disconnected                  | Honest reconnect status; do not fabricate freshness or delivery                      |
| Unknown route                          | Preserve actual 404 handling; EVE-216 owns branded shell integration                 |

## All-role usability and access validation

Role names describe representative test accounts, never branching logic in UI.
Read actual grants and scopes; a role's display name does not grant access.
The five standard roles share the same company palette and components.

| Representative role      | Journey to verify where current grants allow                                    | Denied/privacy check                                               |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Super Admin              | Login, dashboard, users/roles, departments/teams, work and analytics            | Sign-out and revoked-session stale-content removal                 |
| Management/Administrator | Dashboard, permitted operation oversight, reporting review and analytics        | Admin controls absent without their actual grants                  |
| Department Manager       | Department/team views, assigned tasks and permitted report scope                | Other departments' records and unsupported organization-only pages |
| Team Member/Employee     | Personal dashboard, tasks, report draft/submission, Discuss, calendar and To-Do | Management metrics/review controls and other users' personal data  |
| Talent/Artist Manager    | Talent and supported assignments, permitted planning/collaboration              | Non-talent administration and metrics without grants               |

Marketing and Promotion are campaign work areas, Production uses production
projects, and Events uses event/workspace surfaces. Management is an oversight
audience. They are not five new default roles or five new dashboard contracts.
Use permitted representative records in those work areas to check orientation,
labels, discoverable actions, readability and task completion. Do not make denied
surfaces accessible to achieve identical screenshots for every role.

Current events/projects/campaigns/talent surface helpers require organization
scope; production access also checks organization-scoped project grants. Teams
and departments support their implemented department/organization checks. Other
modules have their own scope policies; tests must follow them, not infer a universal
department restriction. The user deferred department-membership administration
and production-only project authorization gaps outside this milestone.

## Verification and inventory maintenance

Capture representative desktop (1440x900), tablet (768x1024) and mobile (360x800)
screenshots and keyboard walkthroughs for each role's permitted flow. Check normal,
empty/error, form-validation and focus states, 200% reflow and reduced motion.
Run the existing axe helper without exclusions and preserve artifact/performance
budgets, including both Ethiopian mobile profiles for changed critical flows.

All-role journeys and screenshots are a validation plan, not claimed results.
Manual assistive-technology release evidence remains required by the existing
quality guidance and M7; passing axe alone is not certification.

Before EVE-228 closes, regenerate the shipped route list and reconcile additions:

```powershell
rg --files apps/web/src/app | Select-String 'page\.tsx$'
```

Review feature dialogs, forms, boards, tables, permission guards and utility
surfaces alongside the route list. Every new shipped surface needs an explicit
styling owner and relevant state checks; no generic catch-all "done" claim.
