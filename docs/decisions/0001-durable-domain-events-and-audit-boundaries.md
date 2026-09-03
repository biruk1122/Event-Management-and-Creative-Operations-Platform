# 0001 - Durable domain events and audit boundaries

- Status: Accepted
- Date: 2026-09-03
- Deciders: Platform architecture
- Linear issue: EVE-33 (EN-07)
- Supersedes: none
- Superseded by: none

## Context

The platform is a modular monolith. `docs/architecture/technical-architecture.md` states that
modules communicate through exported application interfaces and domain events, that PostgreSQL is
the durable source of truth, that Socket.IO broadcasts occur only after durable writes, and that
Redis, a message broker, and other infrastructure are not added before evidence requires them.

Several upcoming issues need a settled contract before they can proceed:

- EVE-99 (RTC-01) real-time contracts and persistence boundaries,
- EVE-37 (EN-09) notification and reminder delivery semantics,
- EVE-39 (IAM-01) authentication and session security data,
- EVE-69 (WSP-01) connected workspace ownership,
- EVE-184 (REL-02) audit logging implementation.

The SRS requires audit logging (section 11) and describes approval-sensitive workflows (sections
4.2, 4.3, 5.11, 5.18) and in-app notifications driven by domain activity (section 5.17). The SRS
does not define an audit entity or an event mechanism, so those are architectural decisions.

`docs/product/product-vocabulary-and-lifecycles.md` already fixes the vocabulary this decision
builds on:

- **Domain event** - a past-tense fact emitted by a module after a successful state change for
  approved asynchronous or real-time consumers.
- **Audit record** - security- or governance-relevant evidence of an action, actor, time, and
  affected resource; not interchangeable with user-facing activity history.
- **Activity history** - a user-facing chronological presentation of approved domain events and
  changes.

`docs/product/permission-catalog-and-role-matrix.md` defines the `audit.read` permission key and
leaves non-Super-Admin audit read access open in `PC-05`.

## Decision

### 1. Domain events are in-process and published after commit

- Domain events are dispatched **within the API process only**. No message broker, no Redis, and no
  external queue are introduced by this decision.
- A domain event uses a versioned envelope: `name`, `version`, `eventId` (UUID), `occurredAt` (UTC),
  `actor` (user id or `system`), `workspaceContext` when applicable, and a typed `payload`. This is
  the same envelope shape used by the Socket.IO layer.
- During a use case, events are **recorded into a request-scoped collector**, not dispatched
  immediately. The collector is flushed to the dispatcher **only after the database transaction
  commits successfully**. If the transaction rolls back, no events are published.
- Real-time broadcast and notification creation are **handlers of domain events**. They therefore
  run only after the durable write, satisfying the architecture rule that broadcasts follow durable
  writes.

### 2. Publication ordering is explicit

1. No event is published unless its originating transaction committed.
2. Events recorded in one transaction are published in **record order (FIFO)**.
3. Events from different transactions are published in **commit order**. No global total order is
   promised beyond this.
4. There is no cross-aggregate ordering guarantee. A consumer that needs strict per-entity order
   uses the entity's monotonic `updatedAt` or version column and reconciles through REST or a
   cursor sync endpoint after any detected gap, rather than relying on event arrival order.
5. Audit records are ordered by `occurredAt` and are written inside the audited transaction, so
   they inherit that transaction's atomicity and commit order.

### 3. Durability tiers for events

| Tier        | Mechanism                                                                                            | Delivery semantics | Used for                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| Best-effort | In-memory post-commit dispatch                                                                       | At-most-once       | Live UI refresh, counters, presence-adjacent updates                      |
| Durable     | Transactional **outbox** row written in the same transaction, then a poller relays and marks it done | At-least-once      | Notifications, any handler whose loss is user-visible or audited-adjacent |

The outbox table and its poller are part of the implementation issue (EVE-184 / EVE-99). This
decision fixes only that the outbox is written **inside** the business transaction and relayed
**after** commit, and that no broker is used to move outbox rows.

### 4. Retry and duplicate behavior

- **Idempotent handlers.** Every handler with side effects is idempotent keyed by `eventId`. It
  records `(eventId, handlerName)` in a processed-markers table, or relies on a natural unique
  constraint on its effect, so that a redelivery is a no-op.
- **Retry.** A failing durable handler is retried with bounded exponential backoff (default three
  attempts). On exhaustion, the event and its error are written to a `failed_events` dead-letter
  table for operator inspection and manual replay. There is no unbounded retry.
- **Duplicates.** The outbox path is at-least-once; a crash after a side effect but before the row
  is marked done causes redelivery, which the idempotency guard absorbs. Real-time consumers must
  already tolerate duplicate frames and deduplicate on `eventId`.
- **Failure isolation.** A failing event for one entity does not block unrelated events. After a
  gap, consumers reconcile through REST rather than waiting for replay.
- **Post-commit handler failure never rolls back the committed write.** It is logged with the
  request id and, for durable events, retried; the business state stays committed.

### 5. Audit records are written inside the transaction

- An audit record is created **synchronously, in the same transaction** as the action it records.
  It is not produced by an asynchronous domain-event handler, because the audit trail must be
  atomic with the change and must not be lost on a crash between commit and dispatch.
- Audit records are **append-only** at the application layer: no update or delete path is exposed.
  Storage-level enforcement (restricted privileges, triggers, or tamper evidence) is deferred to
  EVE-184.
- Audit record shape (fields, not columns): `id` (UUID), `occurredAt` (UTC `timestamptz`),
  `actorUserId` (nullable for system actions), `actorContext` (`ipAddress`, `userAgent`,
  `requestId`), `action` (stable code), `resourceType`, `resourceId`, `workspaceContext` when
  applicable, `outcome` (`success` or `failure`), and `metadata` (JSON, change summary only).
- Audit records **never contain** credentials, tokens, password hashes, session identifiers, or
  full sensitive payloads. They carry identifiers and a minimal change summary.
- **Audit record versus activity history.** Activity history is a user-facing projection that can
  be rebuilt from domain events and is not the system of record for compliance. The audit table is
  the system of record and is not user-facing.
- **Reading the audit log** is governed by `audit.read` from the permission catalog. Which roles
  beyond Super Admin may read it is `PC-05` in that document and is not decided here.

### 6. Enumerated auditable actions

The following actions require a durable audit record. Action codes are indicative; the final
catalog of codes is fixed by the implementing issues.

**Authentication and session** (feeds EVE-39)

- `auth.login.succeeded`, `auth.login.failed`, `auth.logout`
- `auth.session.refreshed`, `auth.session.revoked`
- `auth.password.changed`, `auth.password.reset_requested`, `auth.password.reset_completed`
- `auth.rate_limit.tripped` (security signal; optional but recommended)

**Identity and access administration** (feeds EVE-32 `PC-05`, EVE-45)

- `user.created`, `user.updated`, `user.deactivated`, `user.reactivated`
- `user.role_assigned`, `user.department_assigned`, `user.team_assigned`, `user.team_removed`
- `role.created`, `role.updated`, `role.deleted`, `role.permissions_changed`
- `department.manager_assigned`, `team.manager_assigned`

**Approval-sensitive business actions** (SRS 4.2, 4.3, 5.11, 5.18)

- `task.submitted_for_review`, `task.review.approved`, `task.review.changes_requested`
- `report.submitted`, `report.reviewed`, `report.changes_requested`
- `event.status_changed`, `project.status_changed`, `campaign.status_changed`
- `event.talent_assigned`, `event.talent_removed`, `talent_assignment.completed`,
  `talent_assignment.cancelled`
- `budget.set`, `budget.changed` (event and campaign)

**Data governance and sensitive access**

- `settings.changed`
- `managed_file.downloaded` (for files classified sensitive by EVE-36), `managed_file.deleted`
- `report.exported`, `directory.exported`, `audit.exported`
- `audit.read.bulk` (a large or filtered read of the audit log is itself audited)

**Not audited (deliberate)**

- Ordinary record reads, list and search requests.
- Draft edits, autosave, and unsent message composition.
- Typing indicators, presence, and notification opens.
- Message content changes (covered by the message table and activity history).

## Consequences

**Positive**

- No new infrastructure. PostgreSQL stays authoritative.
- The audit trail is atomic with the action it records and cannot be silently dropped.
- A simple, single mental model: record events, commit, then dispatch.
- Clear inputs for EVE-37, EVE-39, EVE-69, EVE-99, and EVE-184.

**Negative and trade-offs**

- Synchronous post-commit handlers add latency to the request. Handlers with meaningful cost
  (email, external calls) must run on the durable outbox path, not inline.
- In-process dispatch means a future multi-replica deployment needs the outbox relay for every
  cross-instance consumer, and a Socket.IO Redis adapter for real-time fan-out. This decision does
  not adopt that; it records the trigger condition (more than one API replica needing shared
  delivery) for a later evidence-driven decision.
- The outbox and dead-letter tables add two support tables and a poller to operate.

## Alternatives considered

- **External message broker (Kafka, RabbitMQ, NATS).** Rejected: no scale evidence, explicitly
  excluded by the architecture, and disproportionate operational burden for a single-process
  monolith.
- **Redis pub/sub or Redis Streams now.** Rejected: one API replica today. The Socket.IO Redis
  adapter remains a later decision gated on multi-replica delivery.
- **Event sourcing as the system of record.** Rejected: the SRS entities are state-oriented, the
  complexity is large, and a state table plus an audit table plus an activity projection meet the
  requirement.
- **Producing audit records from asynchronous domain-event handlers.** Rejected: an audit record
  could be lost if the process crashes after commit but before the handler runs. Audit must be
  atomic with the change.
- **Publishing events mid-transaction.** Rejected: consumers could observe or broadcast state that
  is later rolled back.

## Open decisions

| ID    | Decision required                                                                                      | Owner          |
| ----- | ------------------------------------------------------------------------------------------------------ | -------------- |
| AD-01 | Audit retention period, archival, and deletion policy.                                                 | EVE-184        |
| AD-02 | Audit tamper evidence: restricted privileges, append-only triggers, or a hash chain.                   | EVE-184        |
| AD-03 | Outbox poller cadence, batch size, ordering within the poller, and failed-event alerting.              | EVE-99 / ops   |
| AD-04 | Multi-replica trigger: the replica count and delivery need that justifies the Socket.IO Redis adapter. | EVE-99         |
| AD-05 | Which managed-file accesses are sensitive enough to audit `managed_file.downloaded`.                   | EVE-36 (EN-08) |
| AD-06 | Audit read access for roles beyond Super Admin.                                                        | EVE-32 `PC-05` |
| AD-07 | Whether the audit table is owned by a dedicated module or a shared infrastructure schema.              | EVE-184        |

## References

- `docs/architecture/technical-architecture.md` - domain events, durable source of truth, no broker
- `docs/product/product-vocabulary-and-lifecycles.md` - Domain event, Audit record, Activity history
- `docs/product/permission-catalog-and-role-matrix.md` - `audit.read`, `PC-05`
- SRS sections 4.2, 4.3, 5.11, 5.16, 5.17, 5.18, 11
- Downstream issues: EVE-36, EVE-37, EVE-39, EVE-69, EVE-99, EVE-184
