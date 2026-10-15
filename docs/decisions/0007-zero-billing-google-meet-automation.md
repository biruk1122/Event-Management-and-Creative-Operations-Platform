# 0007 - Zero-billing Google Meet automation

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner (automatic generation with no paid billing)
- Linear issue: EVE-197 (OPT-03); implementation handoff EVE-201 (OPT-04)
- Supersedes: [0006 - Free manual Google Meet links](0006-free-manual-google-meet-links.md)
- Superseded by: none

## Decision and evidence

The product owner requested automatic Meet-link creation without paid billing after the
manual-only decision. A user-operated OAuth Playground test supplied on 2026-10-15 returned
HTTP 200 for the previously created test event, a successful conference creation status,
and a Google Meet video entry point and join link. This confirms Calendar API conference
creation for that tested Google account. The earlier HTTP 409 was a duplicate event ID;
HTTP 401 was an invalid access token, not evidence that conference creation was unsupported.

This is user-provided test evidence, not an agent-executed provider test or billing audit.
No token, secret, organizer email, join URL, or raw HTTP payload is stored in this ADR.
The result does not establish eligibility for every account or permanently free API usage.

Approve a conditional, opt-in Calendar API adapter for EVE-201 with **no paid billing,
subscription purchase, trial-credit dependency, or automatic quota increase**. A company-operated
Google account that supports the feature, including the tested Gmail account type, is allowed;
a paid Workspace subscription or verified Workspace domain is not a prerequisite imposed by
Lela. Preserve manual HTTPS links for every failure or disabled-feature path. No Google sign-in
to Lela is introduced.

## Consent, privacy, and security

Keep ADR 0005's organizer-owned connection, backend-only encrypted token storage, single-use
session-bound OAuth state, minimal data export, and resource-authorization requirements.
Its Workspace-only/domain-verification assumption is replaced by this decision: account consent
belongs to the authenticated organizer, with a verified provider identity bound server-side.
Do not infer ownership from a client-supplied email, use shared credentials, or let a Super
Admin borrow another organizer's grant. Keep the pilot restricted to explicitly added test users.

Use `calendar.events.owned` for event operations; do not silently expand permissions to other
calendars, Drive, recordings, or transcripts. Explain the scope's actual breadth: access to
events on calendars the account owns, not just Lela-created events. Any identity scopes needed
to verify the account must be declared in EVE-201's consent contract and independently reviewed.
Export only the approved generic meeting title and UTC start/end times to a private event,
without attendees, real titles, descriptions, minutes, files, or department/workspace names.

The Playground authorization was Online for this one-time test; it does not configure Lela's
backend or provide a production refresh token. EVE-201 must explicitly explain offline access
before obtaining refresh tokens. Expired/revoked grants require safe reconnect, not hard-coded
test tokens. Google documents limited access-token lifetimes and refresh-token expiration;
the actual consent publishing mode and expiry behavior must be checked before pilot. See
[Google OAuth guidance](https://developers.google.com/identity/protocols/oauth2).

## Cost and failure boundary

- Default automatic integration to off. Enable a pilot only after the operator verifies that the
  actual project has no linked billing account, paid plan, or trial dependency, records available
  quotas, and confirms the organizer's account eligibility. The test response alone is not proof
  of those conditions. Do not request Cloud billing scopes just to perform this verification.
- Enforce server-side per-connection, project, and daily request caps, including retries and
  conference-status checks. Persist counters so parallel requests and process restarts cannot
  bypass limits. EVE-201 must document concrete conservative defaults against verified quotas.
  Bound retry duration; do not replace a quota error with another paid service.
- On caps, quota/permission errors, unavailable provider, absent consent, or disconnected account,
  retain Lela meetings and manual links. Return a safe actionable status, not a fabricated Meet
  URL or a request to purchase an upgrade. Keep scheduling/notifications independent of Google.
- Verify current Google terms again before activation and periodically during operation. Google
  currently describes standard Calendar API use as having no additional cost while warning of
  planned quota-overage billing later in 2026. Disable automation and retain manual links if
  zero-additional-Google-cost operation can no longer be established. Hosting and internet/data
  costs are separate. See [Calendar pricing and quotas](https://developers.google.com/workspace/calendar/api/guides/quota).

## Handoff and remaining gates

EVE-201 implements the frontend Generate Meet link action, server-side OAuth, encrypted tokens,
provider adapter, durable operation/mapping state, and authorization/refresh/quota/race/failure
tests. Preserve current venue validation: no placeholder links or silently weakened ONLINE/HYBRID
requirements. Persist and reconcile provider event/request IDs after ambiguous creation rather
than issuing duplicate POSTs; protect newer manual links from stale callbacks or retries.

Local meeting cancellation or deleting a Google Calendar event does not by itself prove the
Meet room is inaccessible. Label cleanup honestly; actual room revocation needs verified provider
support and separate authorization, not extra Meet scopes silently added to this adapter.

Merge and close EVE-197 through the repository workflow before starting EVE-201 runtime changes.
Actual billing/quota verification, named operational owner, securely supplied OAuth credentials,
deployment callback registration, encryption-key recovery, and provider test-account eligibility
remain activation gates. Do not reuse or commit the exposed test access token. User consent for
a live connection is still required; this architecture approval is not a substitute.

## Validation

Documentation-only: formatting, ADR references/supersession, sanitized evidence, and independent
review. No application, migration, or provider tests are claimed by this branch. Claude's active
task/report/meeting work remains outside the EVE-197 worktree and is not included in this change.
