# Dashboard aggregation and query contracts

- Delivery slice: EVE-177 (DSH-01).
- Authority: SRS 5.1.1 and 5.1.2; [architecture](../architecture/technical-architecture.md),
  [permissions](permission-catalog-and-role-matrix.md), and
  [analytics definitions](analytics-read-models.md).
- Dependencies verified Done: EVE-110, EVE-128, EVE-134, EVE-176.
- This is the implementation specification for EVE-178, not an assertion that
  dashboard endpoints already exist. No runtime code, tables, migration, cache,
  scheduler, branding or dashboard UI is delivered here.

## Ownership and access

Dashboards composes exported, purpose-built application read interfaces from the
owning modules. Each owner performs its scoped filtering, aggregation and limited
selection inside its own persistence boundary. Dashboards never imports another
module's repository, queries its tables, or loops through public list endpoints
to calculate totals. Add missing bounded read interfaces in EVE-178, not a second
business model. PostgreSQL remains authoritative.

Check the active session and current effective grants at transport and application
boundaries. Employee entry requires `dashboard.read` at SELF; management entry
requires `dashboard.management.read` at MANAGEMENT or ORGANIZATION. These are
entry capabilities, not blanket authorization for underlying sources. Check each
card's source capability before executing its read. No role-name branches: custom
roles receive exactly their effective capabilities.

Management **overview counts** require the relevant source read permission at
ORGANIZATION, in addition to management entry. Counts are not a way around source
permissions. Other management operational lists can use the source module's
current department/assignment scope, but must be labelled `department` or `self`,
never presented as organization totals. A department is resolved from the actor's
current assignment, never a client-selected department or an empty-set fallback.
Employee reads always intersect source authorization with the caller's explicit
assignment/ownership/participation, even if the caller also has organization grants.

Personal To-Dos, calendar entries, read cursors and message counts always belong
to the authenticated caller, including on the management dashboard. Organization
grants do not expose other people's personal records or private conversations.
Conversation membership is rechecked on every read; public-channel discovery is
not membership and grants no message access. Every drill-down independently checks
its source read permission; an analytics aggregate is not a detail-read grant.

## Time and work semantics

- Instants are UTC ISO 8601. `asOf` is server refresh time, not a historical
  snapshot. Each source read uses a consistent statement snapshot; different
  module reads may observe different commits.
- `day` is a valid calendar date `YYYY-MM-DD`, default the server's current UTC
  date. Today is `[day 00:00Z, next day 00:00Z)`, labelled **UTC** in the UI.
  Do not silently use the browser/server local timezone. A localized day contract
  requires a separately approved timezone policy.
- Upcoming is `[asOf, asOf + 7 days)`; exact equality at the upper boundary is
  excluded. Do not mix past overdue items into an upcoming list.
- Pending tasks are TODO, IN_PROGRESS, UNDER_REVIEW or BLOCKED; COMPLETED and
  CANCELLED are excluded. Overdue is pending with `dueAt < asOf`; null due dates
  and equality are not overdue. Shared assignments never multiply task counts.
- Lists of intervals include records overlapping the selected window; point
  deadlines use the half-open window. Undated records remain in relevant totals
  but cannot be manufactured into today's/upcoming schedule.
- Overview is current, all-time state, not the analytics creation cohort. Reuse
  ANA-01 formulas exactly for analytics; don't divide today's completions by
  today's new tasks. No weighted scores, employee rankings or inferred ROI.

## Complete SRS card catalogue

`O` means organization-only source read; `R` means source-resolved operational
read scope; `S` means the caller only. Scalar counts have no entity details.
Every row inherits the freshness/error contract below. Lists default to five
items and have a maximum of ten; truncation is explicit, never an empty success.
No SRS item is substituted with a notification count.

### Management overview (SRS 5.1.1)

| Card key / SRS item                  | Authoritative owner and definition                                                                          | Required source access | Shape |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------- | ----- |
| `totalEvents` / Total Events         | Events: existing events, including completed/cancelled, counted once                                        | `event.read` O         | Count |
| `upcomingEvents` / Upcoming Events   | Events: PLANNING/READY events with `startAt` in the upcoming window                                         | `event.read` O         | Count |
| `activeProjects` / Active Projects   | Projects: general projects with status ACTIVE; specialized productions are not silently added to this count | `project.read` O       | Count |
| `activeCampaigns` / Active Campaigns | Campaigns: ACTIVE marketing and promotion campaigns, once per campaign ID                                   | `campaign.read` O      | Count |
| `pendingTasks` / Pending Tasks       | Tasks: all current pending tasks                                                                            | `task.read` O          | Count |
| `completedTasks` / Completed Tasks   | Tasks: current COMPLETED tasks, not completion-history transitions                                          | `task.read` O          | Count |
| `overdueTasks` / Overdue Tasks       | Tasks: pending and overdue under the common rule                                                            | `task.read` O          | Count |
| `activeEmployees` / Active Employees | Users: ACTIVE platform user accounts (not only the role named Employee; not online presence)                | `user.read` O          | Count |
| `activeTalents` / Active Talents     | Talent: availability AVAILABLE, ASSIGNED or UNAVAILABLE; only INACTIVE is excluded                          | `talent.read` O        | Count |

### Management today and communication (SRS 5.1.1)

| Card key / SRS item                          | Authoritative owner and definition                                                                                                                                                      | Required source access                                         | Shape                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| `todayEvents` / Today's events               | Events: non-cancelled events overlapping the UTC day, with a dated start; point events use start membership                                                                             | `event.read` R                                                 | Event list                                              |
| `todayMeetings` / Today's meetings           | Meetings: SCHEDULED meetings overlapping the UTC day, filtered by owner policy                                                                                                          | `meeting.read` R                                               | Meeting list                                            |
| `todayDeadlines` / Today's deadlines         | Tasks: pending task due instants; Projects: nonterminal general-project end instants in the day; preserve source kind, not one ambiguous total                                          | `task.read` and/or `project.read` R, independently             | Deadline list, per-source state                         |
| `attentionTasks` / Tasks requiring attention | Tasks: union of overdue, BLOCKED and UNDER_REVIEW work; each task once, with explicit reason codes; not an invented urgency score                                                       | `task.read` R; review links additionally require `task.review` | Task list                                               |
| `overdueActivities` / Overdue activities     | Campaigns: PLANNED/IN_PROGRESS campaign activities with `endAt < asOf`; ordinary and promotion activities counted once by base activity ID                                              | `campaign.read` R                                              | Activity list                                           |
| `unreadMessages` / Unread messages           | Discuss: non-deleted messages by other authors beyond the caller's per-conversation read boundary, in currently readable joined conversations                                           | `conversation.read` S plus current membership                  | Count plus bounded conversation counts, no message text |
| `activeChannels` / Active channels           | Discuss: currently joined and readable CHANNEL conversations; no archived/active state exists, so the label means accessible joined channels, not recent posting or all public channels | `conversation.read` S plus current membership                  | Channel count and list                                  |
| `upcomingMeetings` / Upcoming meetings       | Meetings: SCHEDULED meetings starting in the upcoming window under source read policy                                                                                                   | `meeting.read` R                                               | Meeting list                                            |

Deadline sources above are the SRS calendar task/project deadline families. Events
and meetings remain their own cards, not duplicated deadlines. Do not read another
user's calendar to build management today. A mixed-source card must report source
failures individually; never silently present a partial union as complete.

### Management analytics (SRS 5.1.1)

| Card key / SRS item                               | Authoritative owner / existing measure                                              | Required source access                                                            | Shape and bound                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `taskCompletionRate` / Task completion rate       | Analytics via Tasks: `task_cohort`                                                  | `analytics.management.read` MANAGEMENT/ORGANIZATION                               | Counts and nullable percent                         |
| `departmentPerformance` / Department performance  | Analytics via Departments/Tasks: `department_cohort`                                | `analytics.department_performance.read` MANAGEMENT/ORGANIZATION or own DEPARTMENT | Up to ten scoped department count/rate rows         |
| `eventProgress` / Event progress                  | Analytics via Events/Tasks: `event_progress`                                        | `analytics.management.read` MANAGEMENT/ORGANIZATION                               | Up to ten ID/count/rate rows                        |
| `marketingProgress` / Marketing campaign progress | Analytics via Campaigns: MARKETING `campaign_progress`                              | `analytics.management.read` MANAGEMENT/ORGANIZATION                               | Up to ten ID/count/rate rows                        |
| `promotionPerformance` / Promotion performance    | Analytics via Promotion: `promotion_delivery` for one authorized promotion campaign | `analytics.management.read` MANAGEMENT/ORGANIZATION                               | At most seven channel count/rate rows               |
| `monthlyActivity` / Monthly activity overview     | Analytics via operational owners: `monthly_creation` and `monthly_completion`       | `analytics.management.read` MANAGEMENT/ORGANIZATION                               | At most twelve monthly rows, separate family counts |

Use existing analytics response semantics, scope resolution and source timeouts.
Analytics rows currently expose IDs, not titles: no extra name/profile lookup
without the respective source detail-read grant. A supplied campaign filter is
validated through Analytics, not a raw repository lookup. No selected promotion
campaign means `selectionRequired`, not zero performance or a guessed campaign.
Employee performance is available in Analytics but is not an extra dashboard
requirement in SRS 5.1.1; don't add it to this slice.

### Employee (SRS 5.1.2)

| Card key / SRS item                        | Authoritative owner and definition                                                                                                                                               | Required source access                                                     | Shape                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `myTasks` / My Tasks                       | Tasks: current pending work explicitly assigned to the caller, ordered overdue first, then dated due items, then undated                                                         | `task.read` plus assignment S                                              | Task list                                |
| `myTodo` / My To-Do                        | To-Do: caller-owned NOT_STARTED/IN_PROGRESS items, today/due first then priority, retaining undated items                                                                        | `todo.read` S                                                              | To-Do list                               |
| `todaySchedule` / Today's Schedule         | Calendar: caller-owned PERSONAL/REMINDER entries plus current authorized Events/Tasks/Projects/Meetings source reads for caller's assignments/participation, overlapping the day | `calendar.read` S plus each linked source read grant                       | Typed schedule list, per-source state    |
| `myUpcomingMeetings` / Upcoming Meetings   | Meetings: SCHEDULED, caller organizer or participant with Pending/Accepted response, start in upcoming window; Declined excluded                                                 | `meeting.read` plus participation S                                        | Meeting list                             |
| `myUpcomingDeadlines` / Upcoming Deadlines | Tasks: assigned pending due instants; Projects: assigned nonterminal end instants; To-Do: own nonterminal due dates in the upcoming window                                       | Relevant `task.read`, `project.read`, `todo.read`, each intersected with S | Typed deadline list, per-source state    |
| `myUnreadMessages` / Unread Messages       | Discuss: same caller-only read-boundary calculation as management `unreadMessages`                                                                                               | `conversation.read` S plus current membership                              | Count plus bounded conversation counts   |
| `recentActivity` / Recent Activity         | Tasks: persisted TaskActivity records on currently readable, caller-assigned tasks; user-facing task history, including changes made by collaborators                            | `task.read` plus assignment S                                              | Typed task-history list, last seven days |

The existing Calendar feed is caller-owned and may contain projections, but is
not sufficient proof that a linked source is still readable or up to date.
EVE-178 must compose live exported source reads, suppress inaccessible or obsolete
links, and deduplicate projected entries by `(sourceKind, sourceId)` against live
source items. Preserve distinct PERSONAL/REMINDER entries by their calendar ID.
No new stored projection is needed for dashboard scheduling. Bound selection at
the source rather than fetching the entire existing unpaged calendar/To-Do feed.

To-Do `dueDate` and optional `dueTime` are floating calendar values, not a UTC
reminder timestamp. Preserve both in output; don't assign a timezone to `dueTime`
or manufacture `dueAt`. Upcoming date membership uses the UTC calendar dates
covered by the upcoming window, with the final date excluded when its midnight
equals the upper boundary. This date-based lane is labelled separately from timed
deadlines; sort by date and optional time, not a false shared UTC instant. No
date means no deadline. Reminder occurrences are not deadlines.

Recent activity explicitly labels its initial scope **Recent task activity**.
TaskActivity is already durable user-facing history; return only type/time/task
summary, not raw JSON `details`, actor profiles, audit records or outbox payloads.
It does not imply exhaustive cross-module history, deleted-record reconstruction,
or a new activity table. ADR 0001 AD-08's cross-module retention/backfill policy
remains unresolved for a future approved activity-history slice. EVE-178 must
not silently introduce a cross-module event store to fill this card.

## Discuss read-boundary contract

Discuss owns a bounded aggregate interface; don't load every conversation and
its full members/messages to calculate unread counts. Use `(createdAt, id)` as
the message ordering tuple. With a valid `lastReadMessageId`, messages strictly
after that message are unread; `lastReadAt` is when the cursor was updated, not
the read message's creation time, and cannot replace that tuple. Exclude the
caller as author and messages with `deletedAt`.

If the cursor is null and no read time exists, all otherwise-readable messages
are unread (existing membership policy permits reading conversation history).
If a deleted cursor row has been physically removed and only `lastReadAt`
remains, use `createdAt > lastReadAt` as the documented recovery boundary; it is
an approximation, not historical proof of which messages were read. Discuss owns
that fallback and must test it. Mark-as-read remains the existing explicit Discuss
mutation; loading a dashboard never moves a cursor. Notification unread state is
unrelated and must not be used to approximate unread messages.

## Planned aggregate API contract

EVE-178 implements two authenticated GET endpoints:

- `/api/v1/dashboards/management`
- `/api/v1/dashboards/employee`

Allowed query fields are `cards` (comma-separated unique keys from the respective
catalogue), `day`, `limit` (integer 1-10, default 5), plus management-only analytics
`from`, `toExclusive` (UTC date-only cohort interval), `months` (1-12, default 3)
and optional `promotionCampaignId` (UUID). Unknown keys, wrong-audience cards,
duplicates and invalid dates/UUIDs/ranges return 400 before source queries.
Maximum requested keys: 23 management or 7 employee. Omitting `cards` requests
the full audience catalogue; do not silently omit slow cards.

Default cohort is the current UTC month `[monthStart, nextMonthStart)`; custom
cohort bounds must be supplied together, ordered and at most 366 days apart.
Monthly activity uses `months` UTC calendar-month buckets ending with the
current month, which is explicitly partial. `day` affects only today cards,
not analytics, upcoming windows or overdue comparisons. Don't accept `userId`,
`role`, `departmentId`, arbitrary IDs, relation expansion, historical `asOf`,
unbounded search or offset parameters. Analytics controls are rejected on the
employee endpoint. Future full-list navigation uses source endpoints, not an
expanded dashboard response.

The response envelope has `asOf`, `day`, `timeZone: "UTC"`,
`freshness: "live-current-state"`, `partial` and keyed `cards`. Each requested
card has exactly one tagged state:

| State               | Payload                                              | Meaning                                                                                 |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ready`             | `scope`, `asOf`, and typed `data`                    | Authorized successful read; counts may legitimately be zero                             |
| `empty`             | `scope`, `asOf`, and typed empty `data`              | Authorized list has no rows; rates with no denominator are null                         |
| `denied`            | State only                                           | Source capability absent; no query, IDs, scope details, count or timing                 |
| `selectionRequired` | State only                                           | Promotion card needs a campaign selection; no source query                              |
| `unavailable`       | Stable public error code, `retryable`, `requestId`   | Source timeout/failure; never successful zeroes                                         |
| `partial`           | Per-source tagged results and successful typed items | A mixed-source card is incomplete; unavailable sources are named, never counted as zero |

Unauthorized components of a mixed-source card are `denied`, not empty. All
components denied makes the card denied. `partial: true` at envelope level means
an execution failure (`unavailable` or a failed component), not merely a custom
role lacking a card grant or missing a selection. Never return raw SQL/errors or
private-resource existence details. Full authentication failure is 401; denied
audience entry is 403. Both abort composition. Valid authorized composition is
200 even with card failures; a global prerequisite outage before composition
uses the existing 503 Problem Details convention.

Minimal data shapes (backend OpenAPI DTOs in EVE-178, then generated API client):

- Count: `{ count }`; unread adds at most `limit` `{ conversationId, count }`
  rows, authorized `totalConversations` and `hasMore`.
- List: `{ items, hasMore }`. Request `limit + 1` scoped rows to determine
  `hasMore`, returning only `limit`; no unbounded total query is required.
- Operational items: `{ id, title, kind, status, startAt?, endAt?, dueAt?,
dueDate?, dueTime?, attentionReasons? }`, only fields applicable to that source. Task
  activity adds activity ID/type/occurredAt and an authorized task ID/title.
  No descriptions, message bodies, email, phone, budgets, member/assignee arrays,
  file links or raw metadata. Links are constructed from approved typed IDs;
  the owning module rechecks access on navigation.
- Analytics: existing typed numeric response fields and calculation metadata,
  narrowed to the dashboard bounds above, not copied handwritten client types.

Counts are exact non-negative integers, never capped display estimates. Scalar
zero is a ready count; an empty list is explicitly empty. Missing data is neither.
Deterministic order: schedule/deadlines by time then kind then ID; meetings/events
by start then ID; overdue activities by end then ID; attention tasks by overdue,
BLOCKED, UNDER_REVIEW reason precedence then due time (null last) then ID; channels
by name then ID; unread conversations by count descending then ID; recent activity
by occurredAt descending then ID. My Tasks uses due time/null-last then ID within
its precedence groups. To-Do uses today's due date first, then other dated items
ascending/null-last, priority URGENT/HIGH/MEDIUM/LOW, then ID. Analytics retains its
existing deterministic ID order. Merged lists fetch at most `limit + 1` per
authorized source, merge/deduplicate/order, and compute `hasMore` from remaining
unique items or any source's truncation flag.

## Freshness, resilience and responsive states

Read live data on refresh; private responses use `Cache-Control: no-store`. No
server/browser persistent dashboard cache or stale server fallback is introduced.
Browser query keys include account, audience, requested cards and all filters;
cancel/evict on logout, account/session change, permission denial or scope change.
Refetch on focus/reconnect and relevant successful mutations; existing realtime
frames may trigger a REST refresh but are never authoritative counts/history.

In-memory last-success data may remain during a same-account/same-scope refetch
or transient failure only, with its original `asOf` and an explicit **stale**
indicator. It is not a new server state or a fresh success. Hide protected data
while access is unresolved after reconnect/focus or an authorization change;
don't retain stale data on 401/403, revoked membership, changed department,
unknown access, or account switch. No failure extends access to cached rows.

EVE-180/181 render per-card skeletons initially, explicit empty guidance, retry
controls for unavailable cards, and source labels for partial cards. Denied cards
are omitted without leaking counts; access checks also protect direct navigation.
A failed card must not blank successful siblings. Never show 0% for no eligible
analytics work. Announce state changes with a polite live region without moving
keyboard focus; preserve readable labels, timestamps and all permitted cards on
mobile, tablet and desktop. No hover-only actions or color-only status. This
contract does not prescribe company logo/colors or implement the shared shell.

## Bounded query work and downstream verification

One composition calls only requested, permitted owner interfaces. Batch related
scalar counts in each owner, avoid per-item/N+1 reads, select minimal fields in
SQL and limit lists before materialization. Maximum four concurrent owner reads;
each source uses bounded statement timeouts within the existing 500 ms database
target and the whole endpoint must meet the existing 750 ms API hard budget.
Timeouts cancel source work, not merely race an unresolved promise. Profile with
at least twenty warm HTTP samples on representative fixtures in EVE-179/182;
these bounds are requirements, not performance evidence from this docs-only slice.
Aggregate input work is not bounded by output limits: measure plans/cardinality
and add indexes only for demonstrated misses with migration evidence. No new
dashboard table, materialized view, counters, Redis or infrastructure is justified.

EVE-178 owns DTOs/OpenAPI generation, scoped exported owner reads, timeout/error
composition and controller/service tests. EVE-179 verifies persistence/query
behavior; EVE-180 UI, EVE-181 integration, EVE-182 release E2E. Required cases:

1. All 30 SRS catalogue items are represented (23 management, 7 employee).
2. Organization/custom/department grants: source denial prevents querying;
   missing department yields no organization fallback; employee view stays self.
3. Two users with identical roles cannot see each other's To-Do, calendar,
   read cursors, private channels or recent task history. Revoked membership and
   assignment suppress rows and counts on the next read.
4. Counts distinguish ACTIVE/INACTIVE, completed/cancelled/pending/under-review;
   shared assignments and promotion extensions cannot duplicate records.
5. UTC midnight, upper-bound equality, overlapping intervals, undated work,
   declined meetings, date-only To-Do and overdue equality use the specified rules.
6. Unread ties use cursor message time/ID, not cursor update time; own/deleted
   messages excluded; null/deleted cursors and explicit read mutations tested.
7. Lists beyond ten prove stable ordering, source-side limits, merged
   deduplication and accurate `hasMore`; no fetch-all/count-in-browser path.
8. Analytics fixtures match ANA-06, including null rates and partial current
   month; title lookups cannot bypass source grants.
9. Empty, selected/unselected promotion, denied, one-source timeout and all-source
   timeout are distinct; no failed source returns zero or stale server success.
10. Invalid query keys/ranges, session loss and account/department switches clear
    protected data; responsive/keyboard states and API latency budgets are verified.

## Implementation evidence consulted

- [Prisma sources](../../apps/api/prisma/schema.prisma): lifecycle enums,
  TaskActivity, ConversationMember read cursor and calendar ownership.
- [Discuss](../../apps/api/src/discuss/discuss.contracts.ts) and
  [repository](../../apps/api/src/discuss/infrastructure/discuss.repository.ts):
  membership/read cursors; full conversation DTOs are deliberately not reused.
- [Calendar](../../apps/api/src/calendar/calendar.service.ts) and
  [repository](../../apps/api/src/calendar/infrastructure/calendar.repository.ts):
  current owner-only, unpaged feed; bounded live dashboard composition is new work.
- [Analytics contract](../../apps/api/src/analytics/analytics.contracts.ts) and
  [validation](analytics-validation.md): authoritative measures and existing limits.
- [ADR 0001](../decisions/0001-durable-domain-events-and-audit-boundaries.md) and
  [ADR 0004](../decisions/0004-real-time-contracts-and-persistence-boundaries.md):
  task history is not audit/outbox replay; no invented global event store.
