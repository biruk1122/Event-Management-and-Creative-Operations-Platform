# Lela email/password login — EVE-217

## Scope and design

The approved EVE-215 visual specification and user's split-screen reference
govern this login-only change. Desktop uses the official geometric logo, an
event-focused headline, connected-work-area labels and a code-native event-light
composition beside a sign-in card. Below 1024px the decorative hero is hidden;
the logo and labelled form remain first, without an extra hero-image request.
The existing peach/burgundy semantic colors and dark-token compatibility apply.

No distributable event photograph was approved. The composition is native CSS,
not a copied reference photograph, hotlinked stock image or generated logo.
The original logo PNG is untouched. Login uses a right-sized 416x632 WebP with
decoded RGBA pixels matching a deterministic half-size rendering, preloaded at high
priority. Existing shared-logo consumers retain the original default source.
See [asset provenance](../../apps/web/public/branding/README.md) and the
reproducible `scripts/optimize-lela-login-logo.mjs` verification.

The right-sized logo is 24,058 bytes. Its unchanged original PNG has SHA-256
`75b3659e956b31cb3f1210c4726f9491052a33305757dd88f54bedcff165ab52`.

Authentication endpoints, sessions, cache behavior and safe redirect handling
remain unchanged. No Google/OAuth, public signup, password-reset links or backend
workflows were added. Signed-in visits to `/login` retain existing behavior;
EVE-218 owns subsequent home/post-login routing policy.

## Interaction and verification

- Persistent Email/Password labels, autocomplete, 48px inputs and submit control,
  keyboard password reveal/hide, Enter submission and linked field errors.
- Busy feedback and read-only inputs during submission; typed values remain on
  failure. Network rejection becomes a recoverable error with a reachable retry.
- Failure/success feedback receives focus; backend field errors focus the first
  affected input. Reduced motion disables spinner animation.
- Static branding and form markup remain visible before JavaScript hydration.
- Browser coverage includes real valid/invalid credentials, session revocation
  and recovery to the original route, external-target rejection and existing
  signed-in access. Private logout sessions do not revoke shared setup fixtures.
- Responsive screenshots and axe checks cover light/dark at 360x800, 768x1024,
  1440x900 and 720x450 (200%-equivalent reflow, not manual browser zoom).
- Mobile profiles use 360x800/DPR2, cache disabled, CDP network throttling and
  the unchanged baseline/constrained hard LCP/Event Timing limits. Short journey
  interaction samples are not field INP or a p95 release certification.

Manual NVDA/VoiceOver checks and actual browser zoom remain release verification
under [the existing quality baseline](../development/accessibility-and-performance-budgets.md).
Full backend/database/container suites are not needed for this frontend-only
change; isolated auth browser runs use the existing migration/teardown harness.

## Delivery evidence (2026-10-09)

- Auth/branding unit run: eight files / 71 tests passed. Frontend and E2E type
  checks, focused lint and repository formatting checks passed.
- Production Turbopack and browser-harness webpack builds passed. The unchanged
  artifact budgets passed: JavaScript 537.6 KiB / 750 KiB, CSS 12.6 KiB / 150 KiB,
  public images 193.5 KiB / 1500 KiB; no per-asset limit was exceeded.
- Final isolated browser run `run_769371d2085511df`: 14 tests passed across
  `lela-login.spec.ts auth-session.spec.ts auth-denied.spec.ts accessibility.spec.ts`.
  Includes five role sign-ins, the eight light/dark layout/axe/reflow cases,
  visible focus, keyboard reveal/submit, pre-hydration content and real session
  recovery/redirect checks. Teardown removed its isolated PostgreSQL schema.
- Baseline cold login: LCP 968ms, sampled interaction upper bound 24ms.
  Constrained cold login: LCP 2416ms, sampled interaction upper bound 16ms.
  Both meet target and hard-limit rows; real sign-in remained operable.
  Login-document LCP and short-journey interaction measurements are not field
  INP. Profile screenshots and metric attachments live in the ignored run report.
- The initial constrained-profile failure (11.884s LCP) and first optimization
  (7.580s) were not accepted as passing. Right-sizing and prioritizing the logo
  resolved the failure without changing thresholds. Both earlier schemas were
  removed by teardown (`run_282cd7d2f4737d8b`, `run_f7404bd035eba5ac`).
- Final desktop/mobile/tablet screenshots were visually compared with the
  original artwork and checked for legibility, clipping and clear form priority.
- Independent review found no blocking defects; the source-derived WebP and
  original source hash were independently verified. Manual assistive technology
  and actual zoom remain the release checks described above.

Branch push, PR, merge and Linear Done are separate authorized delivery steps.
