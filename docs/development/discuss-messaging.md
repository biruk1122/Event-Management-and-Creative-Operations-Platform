# Messaging interface

Direct messages, group conversations, and channels share a responsive conversation
sidebar, message thread, and composer. The existing Lela color tokens apply in
light and dark themes. Initials represent people without profile-image contracts;
the interface does not invent online presence.

## Composer and attachments

Enter submits, Shift+Enter inserts a newline, and IME composition does not submit.
A synchronous submission guard prevents repeated Enter presses from duplicating
an in-flight send. Failures preserve text. The searchable common-emoji picker
inserts at the current selection and returns focus to the composer.

Attachments use the existing private managed-file flow: upload intent, signed
storage POST, server verification and scan, then persistent message association.
The existing allow-list and 10 MiB limit apply. No file bytes, signed grants, or
attachment metadata are persisted in browser storage. An attachment-only message
uses its filename as its text because the existing API requires message content.

The API requires a persisted message before attachment finalization. If attachment
upload fails after that message is saved, Retry attachment reuses the saved message
and preserves the file selection. Discard failed attachment clears that selection
and starts a fresh composer; the saved message remains in history. This state lasts
while the conversation remains mounted. A page reload discards unsent local files.

Image previews fetch an authorized download grant and display the original bytes
through an object URL, revoked on unmount. The larger preview uses the same bytes.
Downloads request a fresh authorized grant with the existing safe filename and
attachment headers. Object storage must allow browser POST and GET from the web
origin through CORS; a successful API grant alone does not verify this setup.
When storage has a container-only address, `FILE_STORAGE_ENDPOINT` remains the
API's internal address and `FILE_STORAGE_PUBLIC_ENDPOINT` supplies the address
used to sign browser grants. Docker defaults these to `minio:9000` and
`localhost:9000` respectively. Set the public endpoint to a browser-reachable
HTTPS address in deployed environments.

## Read state and live updates

Sending is shown during submission. A single check means the API persisted the
message. Double checks mean a recipient's persisted read cursor covers that
message. Groups/channels label the number of current members whose cursors cover
it. The UI conservatively uses cursors found in the loaded history and never
infers delivery or reading from a successful send or a socket connection.

The active, focused, visible thread acknowledges its latest message when at the
bottom. Database cursor updates are serialized and cannot move backwards, even
when an older tab submits a stale cursor. Sidebar unread counts exclude deleted
messages and the viewer's own messages. Nonmembers of a discoverable channel
receive no last-message preview or unread count derived from its message history.

The server publishes `discuss.invalidated`, version 1, with an empty payload to
current members' existing authenticated user rooms after message mutations,
attachment finalization, and cursor changes. It contains no message content,
conversation IDs, filenames, or signed URLs. Clients reconcile through authorized
REST queries, including after reconnect. A 15-second foreground refresh provides
recovery for missed advisory frames. Existing durable notification events remain
unchanged.

Conversation lists and older messages use the existing paginated APIs. The thread
retains the scroll position when loading older messages and follows incoming
messages only when already near the bottom. API additions are optional response
fields generated through OpenAPI: conversation `lastMessage`/`unreadCount`, and
message `attachmentCount`. No database migration or new dependency is required.

## Verification

Focused frontend tests cover composer input, emoji insertion, attachment retry,
read acknowledgements, scroll behavior, and authenticated file transport. API
tests cover storage signing and messaging behavior; database integration tests
cover unread summaries, privacy, and monotonic read cursors.

The browser journeys exercise direct messages and channels against the real API,
database, and object storage, including original-byte downloads, image previews,
reload persistence, access denial, read receipts, responsive layouts, and light
and dark accessibility checks. Production builds are prepared separately for
verification on Windows because file tracing can exceed Playwright's server
startup timeout. Physical-device soft-keyboard behavior remains a manual check.
