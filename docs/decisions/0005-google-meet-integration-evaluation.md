# 0005 - Google Meet integration evaluation

- Status: Superseded
- Date: 2026-10-14
- Deciders: Product owner (policy approval); independent architecture review (no findings)
- Linear issue: EVE-197 (OPT-03)
- Supersedes: none
- Superseded by: [0006 - Free manual Google Meet links](0006-free-manual-google-meet-links.md)

## Decision and approval boundary

Evaluate an optional, organizer-owned Google Calendar adapter that creates Google Meet
conferences. Keep manual HTTPS meeting links as the operational default. **Defer live
integration to EVE-201 until the policy and operating gates below are approved.** This ADR
adds no credentials, OAuth routes, vendor dependencies, database changes, or Google sign-in.

The product owner authorized this evaluation, selected company-managed Google Workspace
accounts, and explicitly approved the minimal-export, organizer-consent, manual-fallback and
activation-gate policy on 2026-10-14. This approves the described data boundary, not a Google
subscription, broader data transfer, new spending, or production activation. Acceptance of this
ADR does not waive EVE-201's operating gates or authorize provider code in this issue.

## Context and current behavior

SRS sections 5.13 and 5.14 (PDF pages 22-24) require physical, online, and hybrid meetings,
participants' responses, availability, invitations, reminders, and the platform calendar.
Section 13 (page 46) identifies Google Meet as a potential integration, not a mandatory
provider or a requirement to synchronize all Google calendars. EVE-128, the meeting E2E
dependency, is Done in Linear.

The committed Meeting model already stores organizer, type, UTC interval, participants,
workspace, status, and optional `onlineLink`. The API validates HTTPS links; meeting creation
and organizer mutations use existing grants and resource checks. PostgreSQL and the Lela
calendar projection remain authoritative. Google authorization must never replace these
checks or grant access to another department's meeting.

## Alternatives evaluated

| Approach                                               | Consent and data boundary                                                          | Calendar mapping                                                  | Outcome                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Manual Meet or other HTTPS link                        | No Google tokens held by Lela; organizer shares a link                             | Existing Lela projection only                                     | Keep available, including when integration is disabled               |
| Calendar API with Meet conference data                 | Organizer OAuth; owned-calendar event scope is wider than just Lela-created events | One private Google event per opted-in Lela meeting                | Recommended conditional pilot; explicit scheduling artifact          |
| Meet REST API alone                                    | User OAuth with app-created-space scope                                            | Creates a meeting space, not the Google Calendar scheduling event | Viable link-only alternative, not the selected calendar-export pilot |
| Domain-wide delegation or shared organizer credentials | Administrator impersonation or shared credential blast radius                      | Broad calendar/identity management                                | Reject for this slice; requires a separate security decision         |

Calendar supports conference creation with `conferenceDataVersion=1`. The selected candidate
scope is `https://www.googleapis.com/auth/calendar.events.owned`; it can access events on
calendars the user owns, not exclusively Lela events. Application checks must restrict every
read/write to the saved mapping. Do not silently broaden to full calendar, calendar-list,
free/busy, Drive, recording, or transcript scopes. [Calendar scopes][scopes],
[event insertion][insert], and [conference resource][events] support this comparison.

Meet REST uses user authentication; `meetings.space.created` concerns app-created spaces.
It does not eliminate consent or create the separate Calendar scheduling artifact.
[Meet authentication][meet-auth] and [space creation][spaces] describe this alternative.

## Approved consent, ownership, and privacy policy

- Lela still authenticates with email/password. An already authenticated organizer explicitly
  chooses a separate Connect Google Calendar action, sees the account and requested scope,
  and can decline or disconnect without losing Lela access or manual-link functionality.
- Use the organizer's own company-managed account and primary calendar only. No shared token,
  service-account impersonation, or automatic linking by matching email addresses. Verify the
  returned Google identity and configured company domain; an account-selection hint alone
  is not authorization. Connection ownership is the authenticated Lela user, never a client
  supplied user ID. Recheck active account, organizer identity, and meeting permissions before
  each operation and retry. Super Admin cannot borrow another organizer's consent.
- Export only a generic title (`Lela meeting`) and UTC start/end times for an explicitly opted-in
  ONLINE or HYBRID meeting. Request a private event. Do not export the real title, description,
  agenda, minutes, participant emails, department/workspace names, reports, files, or attachments.
  No Google attendees are populated; Lela retains invitations, responses, and reminders.
  Explain that an event can still be visible to authorized Google administrators or calendar
  delegates; private visibility is not a confidentiality guarantee against them.
- Preview this export before enabling it. The join URL is returned to Lela and exposed only
  through the existing authorized meeting surface. No browser persistence or logs may contain
  OAuth codes, tokens, callback query strings, or full provider payloads.
- A nominated company Workspace administrator owns Google project/consent configuration,
  licensing, quotas, and incident handling; the platform operator owns deployment secrets,
  monitoring, key rotation, and recovery. Actual responsible people must be recorded before pilot.

## Calendar and lifecycle mapping for EVE-201

- Keep Lela's meeting UUID, local calendar, participant responses, reminders, and UTC interval
  authoritative. Map only opted-in meetings to the organizer connection, Google calendar ID,
  event ID, conference request ID, join URL, operation version, and synchronization state.
  No inbound calendar import, attendee-response synchronization, webhook, or calendar-wide scan.
- Create conference data with a stable persisted request ID per creation attempt; handle
  pending, successful, and failed conference generation. Publish a link only after validation
  of a successful video entry point. Persist an event identifier for duplicate reconciliation;
  after an ambiguous timeout, reconcile that same event rather than create another conference.
- Scheduling updates change only the mapped Google event. Serialize operations by meeting and
  connection, reject stale versions, and never overwrite a newer manual link with a late result.
  Provider I/O happens outside the meeting transaction; retain durable retry/reconciliation state
  using existing PostgreSQL boundaries, not speculative infrastructure.
- Cancellation removes only the mapped calendar event when credentials permit; local cancellation
  succeeds even if cleanup fails. Track and surface pending cleanup. Completion preserves the
  scheduling history. Changing to PHYSICAL ends the export and applies existing venue validation.
- Removing a Calendar event, disconnecting OAuth, or clearing `onlineLink` must **not** be described
  as revoking access to the Meet room. Actual conference termination/access controls need separate
  verified provider behavior. Organizer departure/account deactivation stops further use of their
  tokens; reassignment requires the new organizer's own consent and an explicit replacement.

## Token security and disconnect

In the future adapter, use server-side authorization-code exchange, exact registered HTTPS
callbacks, session-bound single-use expiring state, and PKCE where supported. Obtain offline
access only after explaining background scheduling updates. [Google's web-server OAuth guide][oauth]
describes state and offline refresh; [OAuth policies][policies] govern deployment requirements.

Only the API may hold tokens. Encrypt refresh tokens with authenticated encryption and
versioned deployment-managed keys separate from database backups; keep short-lived access
tokens in memory. Refresh under a per-connection lock and save replacement refresh tokens
atomically without erasing the previous token when a response omits one. Key rotation must
support re-encryption and rollback testing. Never reuse Lela session secrets as encryption keys.

Disconnect first blocks new operations, attempts Google grant revocation, then erases local
tokens and pending authorization state. A failed remote revocation remains a visible incident
with instructions to revoke the application in the Google account; do not falsely report remote
revocation as successful. Remove consent-related identity/mapping data when no longer needed
for authorized cleanup; retain only redacted audit metadata under the approved audit policy.
Existing links may remain usable: disconnect removes Lela's credentials, not Google's meeting.

## Failures, quota, cost, and operational exit

| Condition                                                                       | Required behavior                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Declined consent, unsupported account, missing scope, or Workspace policy block | No token connection; explain the failure; retain manual links; never retry consent silently                            |
| Expired access token                                                            | Single coordinated refresh; a revoked refresh grant requires reconnect                                                 |
| Quota 403/429, network timeout, or retryable provider 5xx                       | Bounded exponential backoff with jitter; reconcile ambiguous creation; expose pending/error state; no indefinite retry |
| Permission 403 or malformed request                                             | Do not treat as quota throttling; stop and provide safe remediation                                                    |
| Provider outage or feature disabled                                             | Lela meetings, invitations, responses, calendar, and reminders continue independently                                  |
| Disconnect, account departure, or local cancellation                            | Stop token use; make uncompleted external cleanup visible; never delete unrelated Google events                        |

Use per-connection and project budgets below the actual project quotas, bounded concurrency,
and a kill switch. Do not poll all calendars or hard-code documentation examples as granted
quota. Monitor redacted failure categories, pending work age, quota consumption, and duplicate
reconciliation. Retry caps and quota settings must be recorded and tested in EVE-201's pilot.

As checked on 2026-10-14, Google documents standard Calendar and Meet API usage as having no
additional cost, with quota-overage billing planned later in 2026. Recheck applicable pricing
at activation; Workspace licensing and platform operation are separate costs. No new paid plan,
billing enablement, automatic quota increase, or overage spending is authorized by EVE-197.
An approved pilot budget and actual console limits are required. See [Calendar limits][calendar-limits]
and [Meet limits][meet-limits]; this is not a permanent free-service guarantee.

Exit strategy: disable automatic exports, stop new provider operations, surface pending cleanup,
and disconnect accounts. Preserve Lela meeting history and manual links. Explain Google-side
cleanup to organizers without claiming the external room was revoked.

## Approval and implementation handoff

| Gate                                                                              | Evidence / state                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Evaluation authorized; company-managed accounts selected                          | Product-owner chat instruction, 2026-10-14                                          |
| Minimal export, consent ownership, privacy and fallback policy                    | Explicit product-owner chat approval, 2026-10-14; broader exports remain unapproved |
| Operational owner, licensed pilot accounts, Google consent/deployment eligibility | Must be named/verified; not supplied in this evaluation                             |
| Actual quotas, pricing and cost ceiling; secret-key recovery plan                 | Must be approved before live pilot                                                  |
| EVE-201 implementation approval                                                   | Deferred; no credentials or vendor implementation in EVE-197                        |

EVE-201 must test organizer-only access, cross-department denial, callback/state tampering and
replay, wrong-domain connection, denied/partial consent, token refresh/revocation/key rotation,
duplicate/ambiguous creation, pending conference creation, manual-link override races, UTC
rescheduling, cancellation cleanup failure, quota backoff, and feature-off/provider-outage
behavior. Provider contract tests should not use production credentials. A separately approved
test Workspace project must verify actual conference eligibility and calendar behavior before
rollout; no live/provider or Ethiopian-network usability claim is made by this desk evaluation.

Validation for EVE-197 is documentation formatting, local references, source verification,
diff inspection, and independent review. Application builds, migrations, and browser suites
are not needed because this branch changes no runtime behavior.

[scopes]: https://developers.google.com/workspace/calendar/api/auth
[insert]: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
[events]: https://developers.google.com/workspace/calendar/api/v3/reference/events
[meet-auth]: https://developers.google.com/workspace/meet/api/guides/authenticate-authorize
[spaces]: https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces/create
[oauth]: https://developers.google.com/identity/protocols/oauth2/web-server
[policies]: https://developers.google.com/identity/protocols/oauth2/policies
[calendar-limits]: https://developers.google.com/workspace/calendar/api/guides/quota
[meet-limits]: https://developers.google.com/workspace/meet/api/guides/limits
