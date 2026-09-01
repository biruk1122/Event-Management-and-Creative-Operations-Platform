---
name: realtime-communication
description: Design, implement, or review Socket.IO real-time behavior for this platform. Use for gateways, event envelopes, rooms, acknowledgements, presence, reconnection, or cross-instance delivery; not for ordinary REST-only changes.
---

# Real-Time Communication

Deliver timely updates without making WebSockets the durable or authoritative state store.

## Architecture

- Read `../../../docs/architecture/technical-architecture.md` and the relevant REST and database
  behavior before defining events.
- Keep PostgreSQL authoritative. Persist state through application services before broadcasting.
- Use the `/realtime` Socket.IO endpoint with authenticated connections.
- Isolate delivery through per-user and authorized per-workspace rooms; never trust a client to
  choose rooms or resource identifiers without server authorization.
- Use versioned event envelopes containing an event name, version, event ID, occurrence time,
  workspace context when applicable, and typed payload.
- Use acknowledgements for client commands and explicit success or Problem Details-like errors.

## Reliability and security

- Validate payloads, enforce permissions in the gateway and application service, rate-limit
  abusive operations, and bound message sizes.
- Design for duplicate delivery, reconnects, late events, and lost connections. Use stable IDs and
  idempotent handling where commands can be retried.
- Fetch missed durable state through REST or a cursor-based synchronization API after reconnect.
- Do not treat ephemeral presence or typing indicators as durable records unless required.
- Add a Redis Socket.IO adapter only when multiple API replicas require cross-instance delivery;
  document degraded behavior and operational ownership first.

Verify authentication failure, room isolation, acknowledgement errors, duplicate/reconnect
behavior, persistence-before-publish ordering, and REST reconciliation. Do not add real-time
infrastructure for a feature that does not need live updates.
