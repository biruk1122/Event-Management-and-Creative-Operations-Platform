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
  external queue are introduced by this decision. A PostgreSQL outbox relay, when required, also
  runs in the API process.
- An internal domain event uses a versioned envelope: `name`, `version`, `eventId` (UUID),
  `occurredAt` (UTC), `actor` (user id or `system`), `correlationId`, `resourceType`, `resourceId`,
  `workspaceContext` when applicable, and a typed `payload`.
- The internal envelope is not a public Socket.IO contract. A real-time adapter maps an approved
  event to an allow-listed public payload and envelope, preserving `eventId` for duplicate
  detection; it must not broadcast the internal payload directly.
- During a use case, events are **recorded into a transaction-scoped collector**, not dispatched
  immediately. Best-effort subscriptions are flushed to the dispatcher **only after the database
  transaction commits successfully**. When an event has durable subscriptions, the transaction
  snapshots each intended subscription by stable `consumerName` and `consumerVersion`, then writes
  the envelope and one delivery record per intended consumer to the PostgreSQL outbox. After
  commit, the relay invokes exactly those recorded consumers. If the transaction rolls back,
  neither path publishes the event.
- Real-time broadcast and notification creation are **handlers of domain events**. They therefore
  run only after the durable business write, satisfying the architecture rule that broadcasts
  follow durable writes.

### 2. Publication ordering is explicit

1. No event is published unless its originating transaction committed.
2. Events recorded in one transaction have a transaction-local ordinal and are offered to each
   handler in that **record order (FIFO)**.
3. Events from different transactions have **no publication-order guarantee**. Concurrent
   transactions and post-commit handlers can interleave, and this design does not expose a global
   database commit sequence.
4. There is no cross-transaction or cross-aggregate causal-order guarantee. Consumers treat an
   event as a fact or invalidation and reload authoritative state when order matters. A downstream
   contract that requires strict per-resource ordering must introduce and document a monotonic
   resource version; `occurredAt` and `updatedAt` are not sequence numbers.
5. Audit queries use `(occurredAt, id)` for deterministic presentation. That order does not claim
   to reproduce database commit order or causality between concurrent transactions.

### 3. Durability tiers for event subscriptions

| Tier        | Mechanism                                                                                     | Delivery semantics | Used for                                                                           |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| Best-effort | In-memory post-commit dispatch                                                                | At-most-once       | Live UI refresh and counters derived from already-committed state                  |
| Durable     | Transactional outbox event and per-consumer delivery records, relayed and marked after commit | At-least-once      | Notifications and approved side effects whose loss would be user-visible or unsafe |

An event may have consumers in both tiers. The direct dispatcher invokes only its best-effort
subscriptions; the outbox relay invokes only the durable delivery records captured when the event
was enqueued, so storing an event in the outbox does not cause the same subscription to run through
both paths.

Durable consumer identities are deployment-compatible contracts. Renaming or versioning a consumer
must preserve an adapter until its existing delivery records drain. Removing a consumer requires an
explicit drain of its remaining records; only a superseding architecture decision may cancel the
underlying business obligation. A newly added consumer receives only newly enqueued events unless
an approved backfill creates delivery records for historical events.

The outbox schema, migration, and poller belong to the downstream implementation issue that first
requires durable delivery, coordinated across EVE-37, EVE-99, and EVE-184. This decision fixes only
that the outbox is written **inside** the business transaction and relayed **after** commit, and
that no broker is used to move outbox rows.

### 4. Retry and duplicate behavior

- **Best-effort failure.** An in-memory best-effort handler is not retried. Its failure is logged
  with `eventId`, `handlerName`, and `correlationId`; it does not roll back the committed write.
- **Idempotent durable handlers.** Every durable handler with side effects is idempotent on
  `(eventId, consumerName, consumerVersion)`. A processed marker or natural unique constraint is
  committed atomically with database side effects. An external call receives that stable tuple as
  its idempotency key when the provider supports one; otherwise its duplicate risk and recovery
  procedure must be approved by the implementing issue.
- **Retry.** A failing durable handler receives the initial attempt plus at most three automatic
  retries with bounded exponential backoff. On exhaustion, the delivery remains durably marked as
  failed for operator inspection and manual replay with the same `eventId`. There is no unbounded
  retry and replay never creates a new logical event.
- **Duplicates.** The outbox path is at-least-once; a crash after a side effect but before the row
  is marked done causes redelivery to the same recorded consumer, which the idempotency guard
  absorbs. Real-time consumers must already tolerate duplicate frames and deduplicate on `eventId`.
- **Failure isolation.** A failing event does not block unrelated events. Because no strict
  cross-transaction order is promised, a consumer that detects a gap reconciles through the
  authoritative API rather than waiting for replay.
- **Post-commit handler failure never rolls back the committed write.** It is logged with the
  request id and, for durable events, retried; the business state stays committed.

### 5. Audit records are durable at the action boundary

- A successful security- or approval-sensitive mutation writes its audit record **synchronously,
  in the same transaction** as the state change. Audit insertion failure rolls back that mutation.
  The record is not produced by an asynchronous domain-event handler, because it must be atomic
  with the change and must not be lost between commit and dispatch.
- If a successful auditable action has no other durable mutation, the audit insertion is its
  transaction and must commit before success is returned or a credential is issued.
- A denied or failed attempt has no successful business transaction to join. Its audit record is
  written in a separate PostgreSQL transaction after the outcome is known and before the response
  completes. If that audit write fails, the attempted action remains denied or failed, a critical
  operational error is emitted without sensitive payloads, and no success is reported.
- Audit records are **append-only** at the application layer: no update or delete path is exposed.
  Storage-level enforcement (restricted privileges, triggers, or tamper evidence) is deferred to
  EVE-184.
- Audit record shape (fields, not columns): `id` (UUID), `occurredAt` (UTC `timestamptz`),
  `actorKind` (`user`, `system`, or `anonymous`), `actorUserId` (required only for `user`),
  `actorContext` (optional `ipAddress`, `userAgent`, `requestId`, and `correlationId`), `action`
  (stable code), `resourceType`, `resourceId` (nullable for collection or unresolved-resource
  actions), `workspaceContext` when applicable, `subjectFingerprint` when an anonymous
  authentication attempt needs correlation, `outcome` (`succeeded`, `denied`, or `failed`), and
  `metadata` (JSON, minimal change summary only). Request-originated actions require `requestId`;
  system actions may instead carry `correlationId`.
- An authentication subject fingerprint is an HMAC of the normalized attempted identifier using a
  deployment secret; it is not a plain hash or raw email, phone number, username, credential, or
  token. EVE-39 owns normalization, key rotation, and retention. `auth.login.failed` uses
  `resourceType = authentication` with a nullable `resourceId`; `audit.read` uses
  `resourceType = audit_log` with a nullable `resourceId` for collection reads.
- Audit records **never contain** credentials, tokens, password hashes, session identifiers, or
  full sensitive payloads. They carry identifiers and a minimal change summary.
- **Audit record versus activity history.** Activity history is a separately persisted,
  user-facing projection of approved domain events and is not the system of record for compliance.
  Best-effort dispatch and completed outbox delivery records are not an event store and do not
  promise reconstruction. The audit table is the system of record and is exposed only through an
  authorized audit-log surface.
- **Reading the audit log** is governed by `audit.read` from the permission catalog. Which roles
  beyond Super Admin may read it is `PC-05` in that document and is not decided here.

### 6. Enumerated auditable actions

The following actions require a durable audit record. These action codes are the canonical EVE-33
catalog. Implementing issues may add versioned codes when new requirements are approved, but must
not silently rename or omit these codes.

**Authentication and session** (feeds EVE-39)

- `auth.login.succeeded`, `auth.login.failed`, `auth.logout`
- `auth.session.refreshed`, `auth.session.revoked`
- `auth.password.changed`, `auth.password.reset_requested`, `auth.password.reset_completed`
- `auth.rate_limit.exceeded`
- `authorization.denied` for denied security-sensitive or administrative operations

**Identity and access administration** (feeds EVE-32 `PC-05`, EVE-45)

- `user.created`, `user.updated`, `user.deactivated`
- `user.role_assigned`, `user.department_assigned`, `user.team_assigned`, `user.team_removed`
- `role.created`, `role.updated`, `role.deleted`, `role.grants_changed`
- `department.manager_assigned`, `team.manager_assigned`

**Approval-sensitive business actions** (SRS 4.2, 4.3, 5.11, 5.18)

- `task.submitted_for_review`, `task.review.approved`, `task.review.changes_requested`
- `task.assignee_added`, `task.assignee_removed`
- `report.submitted`, `report.reviewed`, `report.changes_requested`
- `event.status_changed`, `project.status_changed`, `campaign.status_changed`
- `event.manager_assigned`, `event.manager_removed`, `event.team_assigned`, `event.team_removed`
- `project.manager_assigned`, `project.manager_removed`, `project.team_assigned`,
  `project.team_removed`
- `campaign.manager_assigned`, `campaign.manager_removed`, `campaign.team_assigned`,
  `campaign.team_removed`
- `talent_assignment.created`, `talent_assignment.completed`, `talent_assignment.cancelled`
- `budget.set`, `budget.changed` (event and campaign)

These assignee, manager, and team actions are mandatory whenever the relationship changes effective
task or workspace access. An implementing issue that introduces another assignment capable of
granting or revoking access must extend this catalog explicitly rather than treating it as ordinary
record editing.

**Data governance and sensitive access**

- `settings.changed`
- `managed_file.downloaded` (for files classified sensitive by EVE-36), `managed_file.deleted`
- `channel.visibility_changed`, `channel.member_added`, `channel.member_removed`
- `audit.read`

If a later approved issue introduces report, directory, or audit-log export, that issue must add a
canonical export audit action. This decision does not authorize those features.

**Not audited (deliberate)**

- Other than the explicitly listed security-sensitive reads, ordinary record reads, list requests,
  and searches.
- Draft edits, autosave, and unsent message composition.
- Typing indicators, presence, and notification opens.
- Ordinary user-authored message creation and edits. Administrative moderation or deletion, if a
  later issue introduces it, is security-sensitive and must add a canonical audit action.

## Consequences

**Positive**

- No new infrastructure. PostgreSQL stays authoritative.
- The audit trail is atomic with the action it records and cannot be silently dropped.
- A simple, single mental model: record events, commit, then dispatch.
- Clear inputs for EVE-37, EVE-39, EVE-69, EVE-99, and EVE-184.

**Negative and trade-offs**

- Synchronous best-effort post-commit handlers add latency to the request. Handlers with meaningful
  cost (email, external calls) must run on the durable outbox path, not inline.
- In-process dispatch means a future multi-replica deployment needs the outbox relay for every
  cross-instance consumer, and a Socket.IO Redis adapter for real-time fan-out. This decision does
  not adopt that; it records the trigger condition (more than one API replica needing shared
  delivery) for a later evidence-driven decision.
- The outbox delivery state and idempotency storage add persistence and a poller to operate.

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

| ID    | Decision required                                                                                      | Owner                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| AD-01 | Audit retention period, archival, and deletion policy.                                                 | EVE-184                                                                                                            |
| AD-02 | Audit tamper evidence: restricted privileges, append-only triggers, or a hash chain.                   | EVE-184                                                                                                            |
| AD-03 | Outbox cadence, batch size, claim strategy, backoff intervals, and failed-event alerting.              | Resolved by [ADR 0004](0004-real-time-contracts-and-persistence-boundaries.md)                                     |
| AD-04 | Multi-replica trigger: the replica count and delivery need that justifies the Socket.IO Redis adapter. | Resolved by [ADR 0004](0004-real-time-contracts-and-persistence-boundaries.md)                                     |
| AD-05 | Which managed-file accesses are sensitive enough to audit `managed_file.downloaded`.                   | EVE-36 (EN-08)                                                                                                     |
| AD-06 | Audit read access for roles beyond Super Admin.                                                        | EVE-32 `PC-05`                                                                                                     |
| AD-07 | Whether the audit table is owned by a dedicated module or a shared infrastructure schema.              | EVE-184                                                                                                            |
| AD-08 | Activity-history projection ownership, retention, and approved backfill behavior.                      | Reassigned by [ADR 0004](0004-real-time-contracts-and-persistence-boundaries.md): the activity-history-owning epic |

## References

- `docs/architecture/technical-architecture.md` - domain events, durable source of truth, no broker
- `docs/product/product-vocabulary-and-lifecycles.md` - Domain event, Audit record, Activity history
- `docs/product/permission-catalog-and-role-matrix.md` - `audit.read`, `PC-05`
- SRS sections 4.2, 4.3, 5.11, 5.16, 5.17, 5.18, 11
- Downstream issues: EVE-36, EVE-37, EVE-39, EVE-69, EVE-99, EVE-184
