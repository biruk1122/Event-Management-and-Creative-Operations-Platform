# 0003 - Notification and reminder delivery semantics

- Status: Accepted
- Date: 2026-09-08
- Deciders: Platform architecture
- Linear issue: EVE-37 (EN-09)
- Supersedes: none
- Superseded by: none

## Context

The SRS requires in-app notifications for task, message, meeting, event, To-Do, and report
activity, with email as an optional channel. It names notification types but does not define their
durable record, recipients, scheduling, deduplication, retries, preferences, or recovery after a
missed real-time delivery.

ADR 0001 establishes that PostgreSQL is authoritative; notifications are durable, at-least-once
domain-event consumers; and real-time delivery occurs only after a durable write. It also fixes the
outbox retry ceiling and prohibits a broker or Redis without evidence. The permission catalog grants
each active authenticated user `notification.read` at `self`, which includes viewing and marking
only their own notifications. The product vocabulary fixes notification read state as
`Unread -> Read` and leaves delivery behavior to OD-11.

## Decision

### 1. The in-app notification record is the durable source of truth

- A notification is a per-recipient record stored in PostgreSQL. NTF-01 owns its schema and
  migration. Its minimum logical shape is: UUID id, recipient user id, SRS type, source event id,
  deterministic occurrence key, a server-derived title and body, source context, created time in
  UTC, and nullable read time in UTC.
- The source context is an allow-listed, typed notification-target union maintained by the producer
  adapter. It is not an unchecked `entityType/entityId` reference. Each target variant must resolve
  through an approved module relation and authorization policy before it becomes a link or visible
  detail in a notification.
- The API, not the browser or a Socket.IO frame, creates records and changes read state. A user may
  list their own feed and mark only their own records read. Marking read is idempotent: it sets the
  first `readAt` value and does not create an event, notification, or audit record. The initial
  release has no mark-as-unread operation.
- Notification records are retained for 90 days from creation and then removed by an idempotent
  cleanup job. Retention never extends a source record's authorization: an item whose target is no
  longer visible is suppressed from the feed and unread count immediately. Its stored source detail
  is not exposed as a substitute for access to the underlying record.

### 2. Required notification producers and recipients

The following table is the complete initial SRS type contract. A recipient must be an active user at
the time the notification is created; a producer excludes the actor where that would send someone a
notification about their own action. Current authorization is checked again when the record is read
or delivered.

| Type                 | Producer                                                         | Recipient rule                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TASK_ASSIGNED`      | Successful task-assignment creation                              | Each newly assigned active user other than the actor.                                                                                                             |
| `TASK_DUE`           | The task deadline scheduler                                      | Each current active task assignee when the task is still nonterminal at the domain-supplied due occurrence.                                                       |
| `TASK_OVERDUE`       | The task overdue scheduler                                       | Each current active task assignee for an incomplete task at each approved overdue occurrence.                                                                     |
| `TASK_APPROVED`      | Successful task review with the Approved outcome                 | Each current active task assignee other than the reviewer.                                                                                                        |
| `TASK_REJECTED`      | Successful task review with the Changes Requested outcome        | Each current active task assignee other than the reviewer.                                                                                                        |
| `NEW_MESSAGE`        | Successful message creation                                      | Each current active conversation member other than the sender.                                                                                                    |
| `MESSAGE_MENTION`    | Successful message creation after server-side mention resolution | Each active mentioned user who remains a current conversation member, other than the sender. It is separate from `NEW_MESSAGE` and may coexist for the same user. |
| `MEETING_INVITATION` | Successful creation of a meeting participant or invitation       | Each newly invited active participant other than the organizer.                                                                                                   |
| `MEETING_REMINDER`   | The meeting reminder scheduler                                   | Each current active participant whose response is Pending or Accepted at the domain-supplied reminder occurrence; Declined participants are excluded.             |
| `EVENT_REMINDER`     | The event reminder scheduler                                     | The current active event manager and active members of currently assigned teams who retain event visibility.                                                      |
| `TODO_REMINDER`      | The To-Do reminder scheduler                                     | The active owner of that To-Do item only.                                                                                                                         |
| `REPORT_REMINDER`    | The reporting-period scheduler                                   | Each active user currently authorized and expected to submit that report type for the period.                                                                     |

No producer may create a notification from a failed, denied, rolled-back, draft-only, or client-only
action. Source modules own their event names and the precise UTC due/reminder occurrence. The
notification module does not invent a lead time, local timezone, or reporting audience where the
SRS has not supplied one. A reschedule or recipient change cancels only undelivered superseded
occurrences; already-created notifications remain historical records subject to the access rule
above.

### 3. Scheduling, idempotency, and retries

- An immediate producer records a domain event in the successful source transaction. A scheduled
  producer persists its deterministic occurrence key and intended source context before attempting
  delivery. Both use a durable outbox subscription captured in the originating transaction, as
  required by ADR 0001.
- NTF-01 enforces one notification per `(recipientUserId, type, occurrenceKey)` with a database
  unique constraint. Immediate occurrence keys include the source event id. Scheduled occurrence
  keys include the source record id, the exact scheduled UTC instant, and a rule/version identifier.
  Replays, duplicate frames, scheduler overlap, and retries therefore cannot create duplicate
  records.
- Creating the notification and recording that the durable consumer processed its
  `(eventId, consumerName, consumerVersion)` tuple occur atomically. A crash after commit can retry
  safely; a uniqueness conflict is a successful idempotent outcome, not an error reported to users.
- Failures use ADR 0001's bounded retry policy: the initial attempt and at most three automatic
  retries with bounded exponential backoff. An exhausted delivery remains durably failed for
  operator inspection and manual replay with the same event id or scheduled occurrence key.
  Retrying never creates a new logical notification or rolls back the already-committed source
  action.
- The scheduler is idempotent and uses UTC instants only. Its implementation belongs to NTF-01 or
  the first approved scheduler-owning notification issue; it must use database-backed claims or
  equivalent transactional exclusion rather than process-local timers or arbitrary sleeps.

### 4. Preferences and optional email

- Every active user starts with in-app delivery enabled for every SRS notification type. A user may
  mute only `TASK_DUE`, `TASK_OVERDUE`, `NEW_MESSAGE`, `MEETING_REMINDER`, `EVENT_REMINDER`,
  `TODO_REMINDER`, and `REPORT_REMINDER`. They cannot mute assignment, review outcome, mention, or
  meeting-invitation notifications because those represent direct action, outcome, or participation
  obligations.
- Preferences are per user and type, evaluated before creating the per-recipient record. A muted
  type does not create an in-app record, unread count, or real-time frame for that recipient. A
  preference change affects future occurrences only; it does not delete existing records.
- Email is disabled and unimplemented in the initial release. It has no provider, template, queue,
  or fallback path under this decision. A future approved email adapter must be opt-in per user and
  type, consume the already-created in-app notification through its own durable, idempotent
  subscription, and never make email success a condition of recording the in-app notification.

### 5. Delivery and missed-event recovery

- The authenticated REST feed is authoritative. It returns only the caller's currently visible
  notifications in deterministic `(createdAt DESC, id DESC)` order, uses an opaque cursor, and
  exposes an unread count derived from the same access-filtered records. It does not expose a
  target title, body, or link that the user cannot currently access.
- A successful notification creation may publish a minimal, versioned real-time invalidation after
  commit to the recipient's authorized per-user room. The frame contains no authoritative feed
  state or sensitive source data; its notification id lets a connected client refresh or deduplicate.
- On connection, reconnection, an acknowledgement failure, a duplicate frame, or an unknown id, a
  client fetches the REST feed and unread count. A missed frame is never retried as the source of
  truth and never causes an extra notification record. Real-time delivery is advisory only.
- Notification creation failures are visible to operators through the durable outbox failure state,
  not through a client-visible partial record. The source module's successful mutation remains
  committed, and recovery replays the same durable notification obligation.

## Consequences

### Positive

- Every SRS notification type has a defined authoritative producer and privacy-preserving recipient
  rule.
- Unique occurrence keys make retries and scheduler overlap safe while preserving durable,
  at-least-once delivery.
- REST reconciliation prevents transient Socket.IO loss from becoming a user-visible data-loss path.
- Email remains an optional adapter rather than a dependency that can block required in-app
  delivery.

### Trade-offs

- The notification service must keep typed target adapters and access checks aligned with every
  future producer module.
- User preferences deliberately do not silence direct assignment, review, mention, or invitation
  obligations.
- Retaining historical notifications while suppressing revoked targets increases query complexity,
  but avoids leaking former workspace, conversation, or task access.
- This decision does not set product-specific reminder lead times; each source module must supply
  an explicit UTC occurrence when its own requirements are approved.

## Open decisions

| ID    | Decision required                                                                                        | Owner                 |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| NT-01 | Exact lead times and reschedule behavior for task, event, meeting, To-Do, and report reminders.          | Owning domain modules |
| NT-02 | Report schedules and the user populations expected to submit each report period.                         | RPT                   |
| NT-03 | User-visible notification copy, localization, batching/digest behavior, and accessibility announcements. | NTF UI/UX             |
| NT-04 | Email provider, consent language, templates, delivery telemetry, and bounce handling.                    | OPT-01 / OPT-02       |
| NT-05 | Notification retention changes required by approved legal, operational, or user-support policies.        | Security / operations |

## References

- SRS sections 5.17 and 11 - required notification types, optional email, and security
- `docs/decisions/0001-durable-domain-events-and-audit-boundaries.md` - durable consumer, retry,
  idempotency, and real-time boundaries
- `docs/product/product-vocabulary-and-lifecycles.md` - notification read state and OD-11
- `docs/product/permission-catalog-and-role-matrix.md` - `notification.read`
- `docs/planning/linear-project-plan.md` - NTF scope and downstream dependencies
- Downstream issues: EVE-111 through EVE-116
