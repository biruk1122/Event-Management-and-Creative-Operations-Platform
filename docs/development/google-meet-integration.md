# Optional Google Meet links (EVE-201)

Automatic Google links are **off by default**. Lela email/password sign-in, meetings,
invitations, reminders, calendar projections and manual HTTPS links do not depend on Google.
See [ADR 0007](../decisions/0007-zero-billing-google-meet-automation.md) and the retained
security policy in [ADR 0005](../decisions/0005-google-meet-integration-evaluation.md).

## Before enabling a pilot

The operator must record their name and a dated activation review covering: no linked Google
billing account, paid plan or trial-credit dependency; current account conference eligibility;
actual Calendar/OAuth quotas; consent publishing mode and test-user eligibility; incident
ownership; encrypted-backup/key recovery; and the registered deployment callback. Do not enable
billing, purchase Workspace, increase quotas, or rely on trial credits for this feature.

Recheck Google's current pricing/terms before activation and at least monthly. If operation
without additional Google charges cannot be established, set `GOOGLE_MEET_ENABLED=false`.
This setting and request caps are risk controls, not a billing audit or a permanent free-service
guarantee. Hosting and internet costs are separate.

Configure these **API-only** environment variables through the deployment's secret mechanism:

| Variable                                             | Value / purpose                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GOOGLE_MEET_ENABLED`                                | `false` until the checks above are complete                                            |
| `GOOGLE_MEET_OPERATOR`                               | Named operational owner                                                                |
| `GOOGLE_MEET_ACTIVATION_REVIEW`                      | Dated review reference covering the above gates                                        |
| `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET` | Web application OAuth client; never `NEXT_PUBLIC_`                                     |
| `GOOGLE_MEET_CALLBACK_URL`                           | Exact API URL ending `/api/v1/meetings/google-calendar/callback`                       |
| `GOOGLE_MEET_RETURN_URL`                             | Fixed frontend meetings URL, with no query/fragment                                    |
| `GOOGLE_MEET_KEY_ID`                                 | Current keyring entry identifier, e.g. `k1`                                            |
| `GOOGLE_MEET_KEYS`                                   | JSON object mapping version identifiers to independently generated 32-byte base64 keys |

Production URLs require HTTPS. Non-production permits HTTP only for localhost/127.0.0.1.
Use SameSite=Lax session cookies so a top-level Google redirect carries the active Lela session.
Register Lela's API callback in Google Cloud, not the OAuth Playground URL. Keep the pilot
restricted to explicitly configured Google test users. No credential or test access token from
chat, logs, screenshots or OAuth Playground should be committed or copied into the application.

The consent screen requests `openid email` to verify the provider account, and
`https://www.googleapis.com/auth/calendar.events.owned` for events on calendars the account owns.
The latter scope covers more than Lela-created events; explain this breadth. Lela operates only
on persisted event IDs on that user's primary calendar. Google sign-in to Lela is not added.

## Organizer workflow

1. Create an ONLINE/HYBRID meeting using a valid manual HTTPS link through the existing workflow.
   Existing venue validation is unchanged; there are no fake placeholder links.
2. Open the meeting details as its organizer, review the minimal-export/offline consent, and choose
   **Connect Google Calendar**. Consent is bound to the current authenticated Lela session and is
   single use for ten minutes. Signing out or switching accounts invalidates that callback.
3. Choose **Generate / sync Meet link**. Lela exports only `Lela meeting`, private visibility and
   UTC start/end times; no attendees, descriptions, real titles, minutes or attachments. Google
   reminders are disabled because Lela owns reminders. Google delegates/admins may still see the
   private event. Only a successful validated Meet video URL replaces the manual link.
4. Rescheduling or cancellation queues work for the existing mapping. The worker checks at most
   two due exports every 30 seconds, refreshes under a per-connection lease and allows at most
   three attempts with exponential delay and jitter. There are no calendar-wide scans/webhooks.
   **Refresh Google status** reloads authoritative state; manual links remain editable on errors.
5. **Remove calendar export** deletes the mapped scheduling artifact but keeps the current link
   as a manual link. It does **not** disable or revoke access to a Meet room. Local cancellation
   succeeds even if external cleanup needs attention. Completed meeting history is not resynced.
6. **Disconnect Google** blocks new work and erases local credentials/consent first, then attempts
   provider grant revocation. If revocation is uncertain, revoke the app in Google Account
   connections and clean up the calendar artifact there. Existing links may still work.

A Super Admin cannot borrow an organizer's connection. Every operation checks active account,
current meeting-update grants, and organizer ownership. Reconnecting the same verified Google
account permits cleanup of its older mappings. A different Google account never receives those
old event IDs: clean the old export in the original Google account and use a manual link for
that meeting; the new account remains usable for other meetings.

## Caps, recovery and rotation

Every provider HTTP request—including OAuth exchange, identity lookup, refresh, conference
status read, retry and revocation—reserves PostgreSQL-backed UTC minute/day budgets atomically.
Counters survive restarts and concurrent processes. Defaults (may only be lowered) are:

| Scope                     |                            Per minute |                          Per UTC day |
| ------------------------- | ------------------------------------: | -----------------------------------: |
| Connection/user           |    10 (`GOOGLE_MEET_USER_MINUTE_CAP`) |     100 (`GOOGLE_MEET_USER_DAY_CAP`) |
| Configured project/client | 60 (`GOOGLE_MEET_PROJECT_MINUTE_CAP`) | 1000 (`GOOGLE_MEET_PROJECT_DAY_CAP`) |

These are conservative application ceilings, **not** Google's allocated quotas. Verify actual
limits before enabling. All replicas for one Google project must share the same database and
keyring; do not split a project across independent deployments/counters. Lower limits if other
applications share the project. Counter history expires after the budget window plus one day.
HTTP calls have an eight-second deadline; connection leases expire after two minutes. Requests
to retry explicitly are also quota counted and rate limited. Invalid/revoked refresh grants
require reconnect. Quota/rate errors back off; permanent permission refusals do not loop.

Persisted Google event and conference request IDs are reused after timeouts or duplicate errors;
the system reconciles that event before issuing any creation retry. A newer manual link or local
schedule/status wins over a stale provider result. Provider failures never fabricate successful
links or zero out meeting data. Pending/failed cleanup is visible in organizer controls.

Refresh tokens and pending PKCE verifiers use AES-256-GCM with owner/purpose-bound authenticated
data and versioned keys. Access tokens live only in memory for a serialized operation. Callback
query strings and request headers containing secrets are not logged or reflected in Problem
Details. Tokens/codes/raw provider responses never appear in API responses.

To rotate: back up the database and keyring separately; add the new key while retaining the old
one; switch `GOOGLE_MEET_KEY_ID`; each connected owner can call authenticated, CSRF-protected
`POST /api/v1/meetings/google-calendar/rotate-key`. Verify the stored ciphertext's version without
printing its contents. Keep both keys through rollback/recovery verification, including pending
consent expiry. Do not remove old keys until every affected connection is re-encrypted and older
backups' recovery obligations are satisfied. Never use Lela session-signing secrets as keys.

## Verification boundary

Automated provider tests use mocked HTTP/adapters, not live credentials or paid services.
PostgreSQL integration tests apply the migration in disposable schemas and exercise quotas,
leases, state replay, ownership, refresh/revocation, reconciliation and manual-link races.
Live eligibility, actual Google billing/quota review and organizer consent are deployment gates;
the earlier user-operated Playground proof is not a production activation or billing audit.
