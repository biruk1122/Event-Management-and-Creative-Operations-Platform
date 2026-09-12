# 0004 - Real-time contracts and persistence boundaries

- Status: Accepted
- Date: 2026-09-12
- Deciders: Platform architecture
- Linear issue: EVE-99 (RTC-01)
- Supersedes: none
- Superseded by: none

## Context

`docs/architecture/technical-architecture.md` names a Socket.IO `/realtime` endpoint "when
implemented" but does not define its envelope, authentication, room model, or reconnect behavior.
ADR 0001 already fixes the boundary this decision must respect: domain events are in-process,
dispatched only after the originating transaction commits; a **real-time adapter maps an approved
internal domain event to an allow-listed public payload and envelope, preserving `eventId` for
duplicate detection, and must not broadcast the internal payload directly**; and no message broker
or Redis is introduced without evidence of more than one API replica needing shared delivery. ADR
0001 also left three items open for this issue: outbox cadence/batch/backoff/alerting (AD-03), the
Redis-adapter trigger (AD-04), and joint ownership of activity-history projection concerns (AD-08).

ADR 0003 already depends on this decision's per-user room and reconnect contract: a successful
notification creation "may publish a minimal, versioned real-time invalidation after commit to the
recipient's authorized per-user room," and a client must treat that frame as advisory only,
reconciling through the REST feed on connect, reconnect, an ack failure, a duplicate frame, or an
unknown id. This decision generalizes that pattern so every future producer (workspace live
updates, direct messages, task boards) extends one contract instead of inventing its own.

No feature currently needs cross-instance delivery: the API runs as a single replica, and no outbox
table exists yet (`docs/decisions/0001` explicitly defers the outbox schema/poller to "the
downstream implementation issue that first requires durable delivery"). This decision fixes the
transport contract and the outbox _policy_ numbers a later implementation issue must build against;
it adds no table and no infrastructure itself, per RTC-01's own scope.

## Decision

### 1. Transport, endpoint, and handshake authentication

- Socket.IO is mounted at `/realtime` on the existing NestJS HTTP server (no separate port, no
  separate process).
- The handshake authenticates from the same `access_token` HttpOnly cookie REST already uses
  (`AccessTokenGuard`'s mechanism): the gateway reads the cookie from
  `socket.handshake.headers.cookie`, verifies the JWT statelessly, then confirms the referenced
  session is active exactly as `AccessTokenGuard` does. A missing cookie, an invalid or expired
  JWT, or an inactive session refuses the handshake before a connection is established. No
  query-string token, custom header token, or second credential type is introduced: introducing one
  would create a second secret-exposure surface for no benefit, since the browser already attaches
  the cookie to the same-origin upgrade request.
- A connected socket carries the resolved `userId`, `sessionId`, and the permission keys resolved at
  handshake time, mirroring `RequestWithContext.user`. These are a snapshot: section 4 below governs
  what happens when they go stale mid-connection.
- CSRF protection is not required for the handshake itself (the cookie is read-only there, and
  Socket.IO's own origin checks apply), but every command handler that would have required
  `CsrfGuard` on its REST equivalent must reject state-changing intent the same way - see section 3.

### 2. The public event envelope

Every server-to-client frame uses this versioned envelope, regardless of producer module:

```jsonc
{
  "event": "notification.invalidated", // stable, dot-namespaced event name
  "version": 1, // integer, starts at 1 per event name
  "eventId": "<uuid>", // identical to the originating internal domain event's eventId
  "occurredAt": "2026-09-12T00:00:00.000Z", // UTC ISO 8601
  "room": "user:018f...", // the room this frame was published to
  "payload": {}, // typed, allow-listed per (event, version)
}
```

- `eventId` is the same UUID ADR 0001's internal envelope already carries. Preserving it across the
  internal-to-public mapping is what lets a client deduplicate a frame it has already applied and
  is what lets `docs/decisions/0001`'s duplicate-tolerant consumer rule apply identically on the
  wire.
- `version` increments only on a breaking payload change for that `event` name. A producer may emit
  both the old and new version during a migration window at its own discretion; a client ignores an
  `event`/`version` pair it does not recognize rather than treating it as an error.
- `payload` is never the internal domain event's raw payload. Each producer module defines and owns
  an explicit, allow-listed public payload shape per `(event, version)`, matching ADR 0001's rule
  that the internal envelope is not a public contract.
- A frame is never the authoritative record of anything. It exists to tell an already-authorized,
  already-connected client "something changed, reconcile," or to carry a small amount of
  already-non-sensitive display data (as ADR 0003 does for a notification's `id`). No frame carries
  data the recipient could not also read through REST at that moment.

### 3. Commands and acknowledgements

- A client-to-server command is a named Socket.IO event carrying `{ version, ...args }` and sent
  with an acknowledgement callback. The server always acks; it never leaves a command
  unacknowledged and never pushes an unsolicited failure frame for a command the client made.
- The acknowledgement payload is one of:

  ```jsonc
  { "ok": true, "data": {} }
  { "ok": false, "error": { "code": "PERMISSION_DENIED", "message": "..." } }
  ```

  `error.code` reuses the same stable codes REST's Problem Details already defines
  (`PERMISSION_DENIED`, `VALIDATION_ERROR`, `NOT_FOUND`, and so on) so a client shares one
  error-handling vocabulary across both transports rather than inventing a second taxonomy.

- **Commands over `/realtime` never perform a durable business mutation.** Creating, updating, or
  deleting a domain record stays REST-only, per the real-time-communication skill's rule that
  WebSockets are not the durable or authoritative state store. The only command categories this
  decision authorizes are:
  1. `room:subscribe` / `room:unsubscribe` - join or leave an authorized room (section 4).
  2. Ephemeral, explicitly non-durable signals a later feature module may add (for example a typing
     indicator) - these are never retried, never persisted, and never gate a durable read.

  A future module that needs a real mutation over the socket must bring its own approved decision;
  this ADR does not authorize one.

- A client-side ack timeout (10 seconds) is the client's own signal to stop waiting and reconcile
  through REST per section 5; the server does not need a matching server-side timeout because every
  command handler in scope here is a fast, synchronous authorization check with no external I/O.

### 4. Room model and authorization

- A room name has the grammar `<scope>:<id>`. This decision fixes two scopes; a later feature epic
  (for example DSC) may add its own scope (`conversation:<id>`) under the same grammar and the same
  join-time authorization rule, without reopening this decision.
- **`user:<userId>`** - every connected socket is joined to exactly its own authenticated user's
  room automatically at handshake. No authorization call is needed beyond "this is the authenticated
  identity itself." This is the room ADR 0003's notification invalidation publishes to.
- **`workspace:<workspaceId>`** - joined only in response to an explicit `room:subscribe` command,
  never auto-joined in bulk at handshake. The gateway resolves the workspace's `kind`, chosen the
  same way `permissionsForKind()` already does for the owning module (event, project, campaign, or
  production), and re-checks that exact permission key at ORGANIZATION scope before joining - the
  same authorization boundary WSP-02 already enforces for the REST workspace surface. A client
  cannot choose a room the server has not authorized; an unauthorized subscribe attempt acks
  `{ ok: false, error: { code: "PERMISSION_DENIED" } }` and never joins.
- A client subscribes only to the workspace(s) currently on screen and unsubscribes when navigating
  away, keeping room membership proportional to what is actually being viewed rather than
  auto-joining every workspace a user could theoretically access.
- **Re-authorization, not just handshake-time authorization.** A permission grant can change or a
  session can be revoked while a socket stays connected. This decision requires:
  1. Every `room:subscribe` re-checks the current grant at call time; a stale handshake-time
     snapshot is never trusted for a new join.
  2. The auth module's existing `auth.session.revoked` domain event (ADR 0001, catalog action) gains
     a best-effort real-time consumer that disconnects every socket whose `sessionId` matches the
     revoked session. This is best-effort, not durable: a socket that misses the disconnect signal
     still loses access on its next REST call or reconnect, so no security boundary depends on the
     disconnect actually arriving.
  3. This decision does **not** require evicting an already-joined workspace room the instant an
     underlying permission is revoked (that would require a live grant-change fan-out this decision
     does not add). A revoked permission stops future `room:subscribe` calls and future REST reads
     immediately; a live socket already in that room may keep receiving frames about a resource it
     can no longer read through REST until it reconnects or resubscribes. A frame is advisory only
     (section 2), so this is a staleness window, not a data-exposure boundary, provided producer
     payloads never carry data beyond what the recipient could already see - which section 2 already
     requires. A future issue may tighten this if evidence shows it matters; it is not decided now.

### 5. Reconnect and missed-event recovery

Generalizing ADR 0003 section 5 to every producer, not just notifications:

- The REST API is always the authoritative source. A real-time frame is never the only place a
  fact is knowable.
- On initial connection, on reconnection, on a command's ack timeout, on receiving a duplicate
  `eventId` it has already applied, or on receiving an `event`/`version` it does not recognize, a
  client re-fetches the relevant authoritative state through REST rather than trusting or repairing
  its state from the socket.
- A missed frame is never retried as a delivery mechanism in itself and never causes an extra
  durable record. If a producer's effect must not be lost, it uses the durable outbox path (section
  6); the real-time frame remains an advisory nudge layered on top, exactly as ADR 0003 already
  decided for notifications.
- Re-subscribing to a `workspace:<id>` room after a reconnect is the client's responsibility; the
  server does not remember a disconnected socket's prior room membership.

### 6. Outbox policy for durable real-time-adjacent delivery (resolves ADR 0001's AD-03)

This fixes the **policy** a later implementation issue (the first to need durable delivery, per ADR 0001) must build against. It does not create the outbox table or poller; RTC-01 adds no table.

- **Claim strategy**: `SELECT ... FOR UPDATE SKIP LOCKED` over pending delivery rows ordered by
  `(createdAt, id)`, so a single poller claims a batch without blocking on rows another concurrent
  claim (today, another instance of the same process) is already handling. This is safe today with
  one replica and remains correct without change if a future replica is added.
- **Cadence and batch size**: a fixed 2-second poll interval, up to 50 claimed rows per cycle. These
  are starting values sized for a single-replica monolith at expected current volume, not a
  performance-tested ceiling; the implementing issue may retune them with evidence, but should not
  need to change the claim strategy to do so.
- **Backoff on failure**: matching ADR 0001's "initial attempt plus at most three automatic
  retries," the concrete schedule is 30 seconds, 2 minutes, then 10 minutes after each failure.
  After the third retry fails, the delivery is marked durably failed for operator inspection and
  manual replay with the same `eventId`, exactly as ADR 0001 already requires.
- **Failed-event alerting**: a structured error log (`eventId`, `consumerName`, `consumerVersion`,
  `correlationId`) on final exhaustion, matching ADR 0001's failure-logging shape. Paging,
  dashboards, or another operational alerting channel are explicitly out of scope: no such tooling
  is chosen yet, and this decision does not select one speculatively.

### 7. No Redis, no event store, no speculative infrastructure (resolves ADR 0001's AD-04)

- This decision does not add Redis, a Socket.IO Redis adapter, a message broker, or an event-store
  table. The API remains a single replica; in-process best-effort dispatch (ADR 0001) and this
  decision's room model are sufficient at that scale.
- The trigger for revisiting this is explicit and measurable: **a second concurrent API replica
  that needs a real-time frame published from one replica to reach a socket connected to another.**
  Until that condition is real (not anticipated), no adapter is added. When it happens, that future
  decision only needs to add a cross-instance pub/sub layer underneath the room model this ADR
  already fixes - the envelope, room grammar, and reconnect contract do not change.
- Payload and rate bounds: an outbound frame's `payload` must stay small (the intent is an
  invalidation or a few display fields, never a list, a file, or a large object graph - those stay
  on REST); an inbound command is rejected above 16 KiB. The gateway enforces a per-connection
  command rate limit; the exact threshold is tuned by the first implementing issue with real traffic
  evidence rather than fixed here, since this ADR's job is the mechanism (a limit exists and is
  enforced server-side), not the number.

## Consequences

**Positive**

- Every future real-time producer (workspace live updates, direct messages, task boards,
  notifications) extends one envelope, one room grammar, and one reconnect contract instead of each
  inventing its own.
- Re-authorizing at every `room:subscribe` and reusing REST's exact per-`kind` permission check
  means the real-time surface cannot become a second, looser authorization path.
- The outbox policy is decided before the first module needs it, so that module's issue implements
  against a fixed contract instead of re-deciding architecture under implementation pressure.
- No new infrastructure; the single-replica trigger for Redis is explicit and measurable rather
  than open-ended.

**Negative and trade-offs**

- The staleness window in section 4.3 (a live socket can keep receiving frames about a resource
  whose permission was just revoked, until it reconnects) is an accepted trade-off, not eliminated.
  It is bounded by section 2's rule that a frame never carries data beyond what REST would also
  currently allow, so the exposure is "a stale invalidation nudge," not "stale sensitive data."
- Explicit subscribe/unsubscribe (rather than bulk auto-join) pushes a small amount of lifecycle
  responsibility onto every frontend screen that wants live updates for a workspace; this is
  deliberate (least-privilege room membership) but is a real integration cost future UI work must
  budget for.
- The outbox cadence/batch/backoff numbers in section 6 are starting values, not evidence-based
  tuning; the first implementing issue should record whether they held up.

## Alternatives considered

- **Bearer token in the Socket.IO connection query string.** Rejected: REST already avoids exposing
  the access token outside an HttpOnly cookie; a query-string token would leak into server logs and
  browser history and would duplicate a credential path for no benefit over reading the same cookie
  the browser already attaches.
- **Auto-joining every workspace room a user can access at handshake.** Rejected: unbounded room
  membership per connection, most of it for workspaces not currently being viewed, and it removes
  the natural point (a subscribe call) at which authorization is freshly re-checked.
- **Adding the Socket.IO Redis adapter now, defensively.** Rejected: no second replica exists; this
  is exactly the speculative infrastructure the architecture and RTC-01's own scope forbid.
- **Immediate live eviction from a workspace room on every permission change.** Rejected for this
  decision: it requires a grant-change fan-out mechanism this ADR does not introduce, and the
  staleness it would close is already bounded to advisory, non-sensitive frames (section 4.3).
- **Allowing durable mutations as Socket.IO commands (for example, "send message" as a command with
  an ack instead of a REST call).** Rejected: it would make WebSockets a second write path with its
  own validation, authorization, and persistence-ordering rules to keep in sync with REST, directly
  contradicting the architecture's "PostgreSQL is authoritative, broadcast after durable writes"
  rule and the real-time-communication skill's explicit guidance.

## Open decisions

| ID                    | Decision required                                                                                                                                                                                                                                           | Owner                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| RT-01                 | Whether and how to close the section 4.3 staleness window (live eviction on permission change) if evidence shows it matters.                                                                                                                                | Future evidence-driven decision                    |
| RT-02                 | The `conversation:<id>` room scope's own subscribe authorization rule.                                                                                                                                                                                      | DSC-01                                             |
| RT-03                 | Retuning the outbox cadence, batch size, or backoff schedule from section 6 with real traffic evidence.                                                                                                                                                     | First implementing issue (likely NTF)              |
| RT-04                 | Exact per-connection command rate-limit threshold.                                                                                                                                                                                                          | First implementing issue                           |
| AD-08 (from ADR 0001) | Activity-history projection ownership, retention, and backfill. This decision's transport contract does not resolve it: an activity feed is a durable, queryable projection, not a transport concern, so it belongs to whichever epic implements that feed. | Reassigned: activity-history-owning epic (not RTC) |

## References

- `docs/architecture/technical-architecture.md` - `/realtime` endpoint, Socket.IO "when authorized"
- `docs/decisions/0001-durable-domain-events-and-audit-boundaries.md` - internal envelope,
  persistence-before-publish, durability tiers, AD-03, AD-04, AD-08
- `docs/decisions/0003-notification-and-reminder-delivery-semantics.md` - per-user room precedent,
  advisory real-time invalidation, REST-as-authoritative reconciliation
- `.claude/skills/realtime-communication/SKILL.md` - transport, room, and reliability guidance this
  decision formalizes
- `apps/api/src/auth/guards/access-token.guard.ts`, `apps/api/src/auth/auth-cookies.ts` - the
  existing REST authentication mechanism this decision reuses for the handshake
- `apps/api/src/workspaces/workspaces.authz.ts` - `permissionsForKind()`, reused for
  `workspace:<id>` room authorization
- Downstream issues: EVE-100 through EVE-104 (RTC-02 through RTC-06), and every future real-time
  producer module
