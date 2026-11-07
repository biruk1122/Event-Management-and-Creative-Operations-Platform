# SMS notifications (AfroMessage)

Status: Phase 1 implemented, awaiting review. Business triggers (tasks, meetings, reports) are not yet connected.

## Flow

Business code calls `SmsService.enqueue(tx, …)` inside its own transaction. The SMS row and an `sms.message.requested` outbox event are written together, so an SMS failure can never roll back the business change. The `sms` outbox consumer sends the message later, outside the business transaction.

## Send outcomes

| Outcome                                                                                  | Stored status            | Automatic retry |
| ---------------------------------------------------------------------------------------- | ------------------------ | --------------- |
| Provider accepted with a message id                                                      | `ACCEPTED`               | none needed     |
| Provider definitively refused (4xx, or an acknowledgement other than success)            | `FAILED`                 | never           |
| Timeout, network error, 5xx, unreadable success, or acknowledgement without a message id | `UNCERTAIN`              | never           |
| Message still `SENDING` after 5 minutes (crash or failed write after a provider call)    | `UNCERTAIN` via recovery | never           |

An `UNCERTAIN` message is never resent automatically. An administrator must resolve it with `POST /api/v1/sms/messages/:id/resolve`: `CANCEL` closes it, and `REQUEUE` sends it again on purpose. `REQUEUE` can duplicate a message the provider actually delivered, so use it only when that has been ruled out.

The stuck-SENDING sweep runs about every 30 seconds inside the relay. It only moves messages; it never sends them.

## Phone numbers and retention

- **Stored:** the normalized Ethiopian E.164 number (`+251…`) is kept in `sms_messages.recipient_phone` so that a queued message can be delivered. Invalid or missing numbers are not stored; the row records `SKIPPED` with a reason.
- **Provider responses:** `sms_delivery_attempts.provider_response` keeps only acknowledgement, status, message and description fields. Phone numbers, credentials and unknown fields are dropped before storage.
- **Shown to administrators:** the history API masks numbers (`+251******123`).
- **Retention:** there is **no automatic deletion**. Rows stay until a retention policy is approved and implemented. Until then, removal is manual and must be recorded.
- **Users removed:** the recipient link is cleared (`ON DELETE SET NULL`), but the stored number remains with the message.

## Rate limiting

Status checks are limited in memory: at most one every two seconds and 30 a minute, with a two-minute block after the provider reports a rate limit. This is correct for a **single API instance only**.

**Requirement before running more than one instance:** replace the in-memory limiter with a shared limiter (for example in PostgreSQL or Redis) so that all instances together stay within the provider's limit.

## Callbacks

The provider calls `GET /api/v1/sms/callbacks/:token?message_id=…&status=…`. The token is a long random value set in `AFROMESSAGE_CALLBACK_TOKEN` (at least 32 characters) and is compared in constant time. A wrong token gets 404. A valid callback records the claimed status and asks for a status check through the provider's rate-limited status endpoint. The callback alone never changes a message's status. The token is redacted from request logs.

## Configuration

Environment variables only; there is no settings table yet. See `.env.example`.

- `AFROMESSAGE_ENABLED` (default `false`)
- `AFROMESSAGE_API_KEY`, `AFROMESSAGE_SENDER_ID` (required when enabled)
- `AFROMESSAGE_CALLBACK_TOKEN` (at least 32 characters when enabled)
- `AFROMESSAGE_IDENTIFIER_ID`, `AFROMESSAGE_BASE_URL`, `AFROMESSAGE_TIMEOUT_MS` (1000–20000)

Secrets have no placeholder defaults. Startup fails when SMS is enabled without the required values.

## Access

Settings and history are restricted to the Super Admin role, through the existing `settings.read` and `settings.update` keys. Admin holds neither key.

## Known gaps

- Provider error codes, the failure response body, and the full status list are not documented by AfroMessage. Only the raw status is stored, and `DELIVERED` is never set.
- Sandbox behaviour is unverified; automated tests use mocked provider responses only.
- Stuck-SENDING recovery and the rate limiter are per instance (the limiter requirement above applies).
