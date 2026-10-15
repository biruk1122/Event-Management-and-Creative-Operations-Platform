# 0006 - Free manual Google Meet links

- Status: Superseded
- Date: 2026-10-14
- Deciders: Product owner (explicit zero-cost requirement)
- Linear issue: EVE-197 (OPT-03)
- Supersedes: [0005 - Google Meet integration evaluation](0005-google-meet-integration-evaluation.md)
- Superseded by: [0007 - Zero-billing Google Meet automation](0007-zero-billing-google-meet-automation.md)

## Context

After approving the conditional integration policy in ADR 0005, the product owner clarified:
"I don't want to cost me; I want to use it for free." This replaces the company-managed
Workspace pilot recommendation with a zero-additional-Google-cost, manual-link decision.
Keep ADR 0005 as historical evaluation evidence, not as authorization to activate an adapter.

## Decision

- Use the free Google Meet offering through an organizer's Google account. The organizer
  creates a meeting directly in Google Meet and pastes its HTTPS join link into Lela's
  existing online/hybrid meeting form. Participants open that link to join.
- Do not purchase Google Workspace, upgrade licenses, enable Cloud billing, add paid API
  usage, or assume trial/promotional credits are permanently free. No API-based automatic
  meeting creation, Google calendar export, OAuth connection, or Google sign-in to Lela.
- Preserve existing meeting authorization, local calendar projection, invitations, responses,
  and reminders. Lela does not obtain Google tokens or export meeting records via an API.
  Google still processes information when people use Meet directly; manual links do not
  imply that Google receives no data.
- Keep EVE-201's automatic provider adapter deferred under this requirement. Any later
  automation requires a new product-owner decision and verified costs/eligibility; never
  enable it silently based on the superseded ADR.

## Limits and consequences

As verified on 2026-10-14, Google's free account guidance lists up to 100 participants and
a one-hour limit for meetings with three or more participants. Meet features and eligibility
remain subject to Google's policies; no recording, unlimited duration, or permanent free
API entitlement is promised. See [Google Meet feature limits](https://support.google.com/meet/answer/13396001?hl=en).

This decision avoids additional Google integration/subscription charges, not existing Lela
hosting, internet, or mobile-data costs. If free Meet limits are insufficient, do not buy an
upgrade automatically; explain the limit and request a separate product decision.

Disconnect/token rotation and external-calendar cleanup are not needed in this manual mode
because Lela holds no Google authorization. Removing a link or cancelling a meeting in Lela
does not revoke the Google room; the organizer manages it in Google Meet.

## Verification and delivery boundary

EVE-197 remains a documentation-only evaluation/decision. No runtime or schema change is
needed to paste links: the existing meeting API already accepts HTTPS `onlineLink` values.
Validate formatting, ADR references, supersession metadata, and independent review. There
is no new API behavior to justify rerunning application builds or browser suites.
