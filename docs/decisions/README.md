# Architecture decision records

This directory holds architecture decision records (ADRs): short documents that capture a single
consequential, durable decision, its context, and its consequences.

## Conventions

- One decision per file, named `NNNN-kebab-case-title.md`, numbered sequentially from `0001`.
- Each ADR begins with a metadata block: `Status`, `Date`, `Deciders`, `Linear issue`, and
  `Supersedes` / `Superseded by`.
- `Status` is one of `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- Do not edit an accepted ADR to reverse it. Add a new ADR that supersedes it and update both
  `Superseded by` and `Supersedes`.
- ADRs record decisions, not implementation. Schema, migrations, and code land in their own issues.

## Log

| ADR                                                          | Title                                        | Status   | Linear |
| ------------------------------------------------------------ | -------------------------------------------- | -------- | ------ |
| [0001](0001-durable-domain-events-and-audit-boundaries.md)   | Durable domain events and audit boundaries   | Accepted | EVE-33 |
| [0002](0002-secure-managed-file-storage-and-lifecycle.md)    | Secure managed-file storage and lifecycle    | Accepted | EVE-36 |
| [0003](0003-notification-and-reminder-delivery-semantics.md) | Notification and reminder delivery semantics | Accepted | EVE-37 |
