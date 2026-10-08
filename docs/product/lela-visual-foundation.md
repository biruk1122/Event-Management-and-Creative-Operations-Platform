# Lela visual foundation

## Authority and delivery status

This is the EVE-215 foundation specification for M6.5. The user's official geometric
logo, peach/burgundy swatches, all-role usability direction and split-screen login
reference govern the visual identity. The reference's script logo and teal palette
are not company assets. Google sign-in is explicitly excluded.

The [SRS](../requirements/software-requirements-specification.pdf),
[architecture](../architecture/technical-architecture.md),
[navigation model](navigation-and-information-architecture.md) and
[quality budgets](../development/accessibility-and-performance-budgets.md) still
govern behavior. This specification does not authorize new APIs, business flows,
permissions, authentication options or settings persistence.

**Color decision, 2026-10-08:** the swatches were resubmitted as chat images, but
their binary files/source pixels were not accessible to the implementation tools.
The user explicitly chose "Use the proposed palette": peach `#EAB79F` and burgundy
`#421C2B`. This supersedes exact-source sampling as a delivery prerequisite. These
are approved design anchors, not a claim of sampled source values. Shared tokens
are applied through production globals; specimen layouts remain isolated from
real application routes. EVE-215 still requires validation and independent review,
and Linear Done must wait for the normal merged-PR delivery workflow.

## Asset provenance and constraints

The original logo is at
`apps/web/public/branding/lela-creative-management-logo.png`, recovered unchanged
from local commit `74e05e788c28a4b4c5a8221dbf7df5ffd28d32e4`.
Its SHA-256 is
`75b3659e956b31cb3f1210c4726f9491052a33305757dd88f54bedcff165ab52`.
The 174,067-byte file matches the geometric emblem and stacked wordmark provided
in the user's reference. It includes a large white canvas; do not stretch it to
fill a header or assume the canvas is transparent.

`BrandLogo` provides full and compact SVG viewports of the original PNG without
redrawing or modifying the bitmap. Source dimensions are 832x1264; measured dark
artwork bounds are x=30..798, y=395..881. The full viewport is `22 387 785 503`;
the emblem-only compact viewport is `22 387 316 502`, leaving safe whitespace
around its original strokes. Both render on white with a reserved aspect ratio
and a single accessible name, or an explicit decorative mode.

Full and compact treatments must retain original artwork and proportions. Use a
light backing on dark navigation rather than inverting the black logo. Any
optimized crop must be reproducible from the source, record crop bounds and
dimensions, and be visually compared with the original. Do not redraw the mark,
substitute the script logo, or use an AI-generated approximation. Downstream
components must reserve image dimensions and provide an appropriate accessible
name, without repeating adjacent branding to screen readers.

The approved design anchors above govern this implementation. No source-swatch
hash or exact pixel sample is claimed. If originals are imported later, record
their hashes/values and compare them without silently changing the approved palette.

No event hero photograph is currently approved as a distributable asset. Prefer
a local, code-native abstract event-light composition using the derived palette
until an original company-owned or explicitly licensed photo is approved. Do not
extract the photograph from the reference, hotlink a stock image, or imply an
unverified license. A photo added later must have recorded provenance and meet
the unchanged image budgets.

## Extended palette and semantic mapping

Use one company identity for all roles. Work-area accents may help orientation,
but must not become unrelated role themes or encode authorization through color.

| Token family                            | Intended treatment                                     | Usage                                   |
| --------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Brand anchors                           | Sampled peach and deep burgundy                        | Provenance; basis for derived colors    |
| Background / foreground                 | Warm ivory and very dark burgundy-neutral              | Page canvas and readable main text      |
| Card / popover                          | White or slightly warm light surfaces                  | Cards, tables, menus and dialogs        |
| Primary / on-primary                    | Deep burgundy with contrast-tested light text          | Main action, selected controls          |
| Primary hover / pressed                 | Deliberately derived burgundy shades                   | Distinct interaction feedback           |
| Secondary / on-secondary                | Soft peach with dark text                              | Supporting actions, highlights          |
| Muted / on-muted                        | Warm neutral with readable muted text                  | Help text, secondary sections           |
| Accent / on-accent                      | Pale rose/peach with dark text                         | Active tabs, restrained emphasis        |
| Border / input                          | Contrast-tested warm-neutral edges                     | Field boundaries, separators            |
| Ring                                    | Distinct contrast-tested focus color                   | Keyboard focus, not only decoration     |
| Sidebar / on-sidebar                    | Deep burgundy with light text                          | Shared navigation                       |
| Sidebar selected                        | Peach/rose highlight with dark text                    | Current destination plus indicator      |
| Success / warning / error / information | Restrained complementary semantic colors               | Text/icon feedback with tinted surfaces |
| Chart series                            | Burgundy, rose, peach, plum; supporting hues as needed | Labelled, distinguishable data series   |

The approved palette uses peach `#EAB79F` and burgundy `#421C2B` as user-selected
design anchors, not sampled source values. Warm ivory `#FFF8F3`, dark text
`#321923`, muted neutral `#F4E7DF`, rose `#8D3758`, plum `#735482` and complementary
status hues form its supporting palette. The full light/dark semantic mapping is
in `apps/web/src/styles/brand-tokens.css`, imported once by production globals.
`foundation-preview.css` contains specimen-only layout styles, not duplicate tokens.
The token contrast tests assert normal-text and important boundary/focus pairs;
they do not prove every possible composited/opacity state in future screens.

Implemented colors map through the existing semantic variables in
`apps/web/src/app/globals.css` and Tailwind theme aliases. Do not maintain separate
hex constants in feature components. Add named states only when existing primitives
need them; avoid an unused token catalog or a component-framework rewrite.

Existing `.dark` tokens must remain coherent and legible. Define compatible dark
canvas/card, text, action, border, focus and chart pairs without adding a theme
selector or account preference backend in this issue.

Check normal text at 4.5:1 and large text at 3:1; important control boundaries and
focus indicators must meet applicable WCAG non-text contrast requirements. Test
actual rendered foreground/background combinations, including hover and active
states, not isolated swatches. Peach is not presumed suitable for text on white.
Status badges need words/icons; chart values need labels and numeric alternatives.

## Typography, spacing and interaction patterns

Retain the existing font stack; do not introduce a font download or large icon
library for decoration. Use a small consistent scale: page titles 24-32px,
section headings 18-20px, body/control text 14-16px and secondary labels 12-14px.
Do not shrink essential mobile content below readable body sizes. Use relative
units, allow wrapping and preserve 200% zoom/reflow.

Use a 4px spacing rhythm, typically 16px mobile page padding, 24-32px desktop
padding, 16-24px card padding and 24-32px between major sections. Tables and
wide schedules may require larger content widths than forms; do not apply one
fixed-width wrapper to every route. Keep forms to a comfortable reading width.
Use restrained radii and shadows, with borders where necessary for contrast;
cards should express hierarchy rather than surround every small element.

Reuse the existing Button, Input, Textarea, Label, Select, Checkbox, Badge, Alert
and Dialog primitives. Foundation additions should cover missing page-header,
card, table/list and tabs patterns only where downstream screens demonstrate a
need. Preserve native semantics, accessible names and existing tests.

| Pattern       | Required behavior                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Page header   | One page heading, concise description, primary permitted action; wrap on mobile                         |
| Form          | Persistent labels, autocomplete, field errors linked to inputs, preserved values on recoverable failure |
| Button        | Normal/hover/pressed/focus/disabled/busy states; avoid duplicate submissions and unexpected focus loss  |
| Table/list    | Clear column labels, pagination/filter context, long-name wrapping and a usable narrow-screen treatment |
| Tabs          | Selected state beyond color; keyboard behavior appropriate to navigation or actual tab panels           |
| Card          | Useful heading and context; supported numbers include unit, period and scope                            |
| Feedback      | Distinct loading/empty/denied/error/success states; retry must be understandable and reachable          |
| Dialog/drawer | Labelled title, keyboard operation, focus trap/restoration and usable small-screen scrolling            |

Transitions must respect reduced motion. Touch actions must meet WCAG target
requirements, with a larger comfortable hit area for frequent mobile controls.
Never conceal an essential action behind hover alone.

## Code-native visual example specifications

Examples are isolated component compositions, not new public product routes.
Use clearly labelled demonstration values rather than fabricated operational
metrics. Do not ship sample data in actual dashboards or analytics requests.

1. **Login:** two-column desktop composition with official logo, restrained hero
   headline and peach-tinted decorative light on the left; an elevated light form
   card on the right. Burgundy primary button. On mobile, logo and email/password
   form first; decorative hero must not delay or obscure access. No Google,
   sign-up or unsupported password-reset links. EVE-217 owns real login changes.
2. **Shell:** deep-burgundy desktop sidebar, readable active item and light content
   area; compact utility header with existing notifications and account actions.
   Demonstrate tablet rail and mobile drawer without deciding open NAV policies.
   EVE-216 owns integration and actual permission-aware navigation.
3. **Dashboard:** restrained header, responsive summary-card grouping, explicit
   scope/period and refresh feedback. Demonstrate loading/empty/error states.
   Preserve all 30 existing card definitions; EVE-220 owns the screen rollout.
4. **Form/table:** labelled fields, validation and focus states; clear table
   headings, readable badges, pagination and narrow-screen presentation. Existing
   mutation rules and filters remain unchanged.
5. **Analytics:** required charts with title, units, legend, distinguishable
   series and numeric table equivalent. Bar charts can compare actual categories;
   line graphs require real time-series data; composition requires genuine
   parts-of-a-whole facts. EVE-221 selects mappings from current API contracts.

Capture examples at 360x800, 768x1024 and 1440x900 in light and existing dark-token
contexts. Record keyboard, axe, reduced-motion and reflow evidence, plus production
artifact budgets. The approved palette has been rendered and tested. `FoundationExamples`
is never imported by a public application route. Its login/card/table/chart data
are explicitly labelled specimens, not business data. The static renderer includes
existing Tailwind styles and shared approved tokens without adding an application
page, API or dependency.

Reproduce the examples using existing workspace tooling:

```powershell
node scripts/render-lela-foundation.mjs
node e2e/scripts/verify-foundation-preview.mjs
pnpm --filter @event-platform/web test src/components/branding
```

Generated light/dark HTML, eight screenshots and `verification.json` live in ignored
`test-results/lela-foundation-preview/`. The browser check uses a temporary
loopback-only server and tests axe, horizontal overflow, reduced-motion mode and
initial visible keyboard focus. Desktop specimens also scan normal/hover/pressed
states. A 720x450 CSS viewport at DPR 2 verifies 200%-equivalent desktop reflow;
this is not a claim of manual browser zoom or assistive-technology testing.
It is not a substitute for real-auth journeys,
manual assistive-technology checks or production performance measurements.

## Navigation decisions and deferred gaps

This foundation identifies decisions; it does not silently approve them. Check
existing product decisions and implementation before seeking new approval.

| NAV item                        | Consequence / owner                                                        |
| ------------------------------- | -------------------------------------------------------------------------- |
| NAV-01 global search            | Do not add a decorative, nonfunctional search field; EVE-216               |
| NAV-02 record URL naming        | Preserve shipped routes/dialogs; no new URL scheme in M6.5                 |
| NAV-03 Meetings placement       | Reconcile SRS Discuss grouping before shell integration; EVE-216           |
| NAV-04 disabled modules         | No invented feature-flag or availability workflow; EVE-216                 |
| NAV-05 global Files index       | Not shipped; retain workspace file surfaces; EVE-223                       |
| NAV-06 admin destinations       | Actual grants remain authoritative; EVE-216/EVE-222                        |
| NAV-07 mobile destinations      | Exact bottom-bar selection needs an existing or explicit approval; EVE-216 |
| NAV-08 safe next targets        | Preserve current safety policy until resolved; EVE-218                     |
| NAV-09 campaign grouping        | Reconcile Projects/Marketing/Promotion grouping; EVE-216                   |
| NAV-10 cross-linked breadcrumbs | Preserve context without inventing hierarchy; EVE-216/EVE-223              |

The user explicitly deferred department-membership administration and
production-only project access gaps. Department Manager is not an automatic
production-only grant. Current project UI checks organization-scoped access.
Do not broaden grants to make a visual example work or claim department
isolation. The inventory records current surfaces, not ideal future access.

## Acceptance ledger

- Imported unchanged original logo: prepared, visual match checked.
- Route/state inventory and all-role validation plan: prepared in
  [lela-screen-inventory.md](lela-screen-inventory.md).
- Exact-source sampling: superseded by the explicit user-approved palette decision.
- Shared light/dark tokens: implemented with contrast and import-isolation tests.
- Reusable page-header, card, table and native section-navigation components and full/compact
  logo viewports: implemented; six component/specimen tests pass.
- Rendered examples: eight light/dark mobile/tablet/desktop and 200%-equivalent
  reflow specimens pass axe, overflow and initial keyboard-focus checks; desktop
  hover/pressed states also pass axe. Desktop/mobile screenshots inspected; mobile
  chart text enlarged and decorative login hero hidden on small screens after review.
- Production semantic-token rollout: implemented; existing page behavior unchanged.
- Real-auth role journeys, release assistive-technology and critical-flow performance:
  downstream integration/release work, not certified by specimens.
- Independent review: complete; initial mobile-priority and reflow findings fixed,
  and final staged changes re-reviewed with no blocking findings.
- Delivery: local implementation validated; commit and external PR/merge/Linear
  closure are tracked separately from this foundation specification.

### Validation evidence

- `pnpm format:check`, frontend lint, frontend type checking and the production
  build passed.
- Frontend tests with `--maxWorkers=2`: 173 files / 1,334 tests passed in the full
  run. Four remaining suites initially lacked required public API/WebSocket test
  environment variables; rerunning those suites with explicit test URLs passed
  all 31 tests. Together these runs cover 177 files / 1,365 tests.
- The 49 new branding tests pass, including light/dark contrast checks.
- `pnpm --filter @event-platform/e2e e2e accessibility.spec.ts reports.spec.ts
dashboard-integration.spec.ts` passed all 12 checks, including five role
  logins, dashboard integration and report authorization/performance. The first
  attempt encountered HTTP 429 responses from the local `.env` rate limit;
  rerunning with test-only `API_RATE_LIMIT_MAX=10000` and `LOG_LEVEL=silent`
  passed without changing product settings. Both isolated test schemas were
  removed by the existing teardown.
- `node scripts/render-lela-foundation.mjs` and
  `node e2e/scripts/verify-foundation-preview.mjs` passed all eight specimen
  cases with zero axe violations.
- `pnpm quality:budgets` passed: entry JavaScript 678.3 KiB, CSS 11.0 KiB,
  and the original logo 170.0 KiB, within existing budgets.
- Manual screen-reader testing and actual browser zoom remain release checks;
  the automated reflow check is explicitly not a substitute for them.
