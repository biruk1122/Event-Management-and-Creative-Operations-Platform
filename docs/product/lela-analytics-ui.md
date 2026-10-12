# Lela analytics presentation — EVE-221

## Chart-to-data mapping (before implementation)

All visuals use the existing generated OpenAPI responses. No directory reads,
extra queries, inferred names, rankings, revenue, ROI or unsupported drill-downs
are introduced. Graphs supplement, never replace, the existing numeric summaries
and accessible tables.

| Measure                           | Visual                                       | Authoritative fields and interpretation                                                                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task completion                   | Horizontal count bars                        | `counts.completed`, `counts.pending`, `counts.overdue`; overdue overlaps pending and is explicitly labelled, not a third disjoint composition slice. No chart when eligible total is zero.                                                                                                           |
| Department / employee performance | Horizontal completion-rate comparisons       | Returned page only, in server ID order; `id`, `percent`, `completed`, `total`. Null percentages remain “No eligible work”, not 0%. Employee totals are never summed or ranked.                                                                                                                       |
| Event / marketing progress        | Horizontal completion-rate comparisons       | Authorized returned page only; `id`, `percent`, `completed`, `total`. Current all-time work, not lifecycle state or an invented trend.                                                                                                                                                               |
| Promotion                         | Horizontal channel delivery-rate comparisons | Selected campaign's returned `channel`, `percent`, `completed`, `total`. No absent channels or average-of-percentages aggregate.                                                                                                                                                                     |
| Monthly activity                  | Six separate monthly count graphs            | Existing UTC `month` buckets for `tasksCreated`, `eventsCreated`, `projectsCreated`, `productionsCreated`, `campaignsCreated`, `tasksCompleted`. Connect only real returned buckets; a single month shows a point, not an invented trend. Completion throughput stays separate from creation counts. |

The bar axes start at zero; percentage comparisons have a fixed 0–100% scale.
Monthly count axes start at zero and use each series' actual maximum with compact
display ticks and full source values in the accessible SVG description/table (a zero-only
series uses a labelled 0–1 display scale). Months and counts have explicit axis
labels. Source families are not added into an ambiguous total. Current-month
observations and live current-state freshness retain the existing caveats.

## Presentation and boundaries

Use existing Lela semantic/chart tokens in light/dark themes. Text labels,
numeric details, bar borders and line/point shapes keep meaning independent of
color and hover. Small SVG graphs and CSS bars add no dependency or animation.
Only the analytics workspace opts into graphs; dashboard catalog cards retain
their existing presentation. The public scope heading stays mounted across
permission checks to preserve the existing mobile LCP correction.

Authorization, query keys, URL/filter/reset behavior, paging, retry and the
explicitly unsupported export action remain owned by the existing controller.
Never render charts from denied, loading, unavailable or failed panels.

## Verification (2026-10-12)

- Analytics, route and dashboard unit suites: 154 tests passed across 12 files.
- Frontend and end-to-end TypeScript checks and scoped analytics ESLint passed.
- Production webpack build passed. Chromium analytics integration/validation:
  19 tests passed against an isolated PostgreSQL schema, including all seven
  measures, organization/department/denied scopes, recovery, pagination and
  the existing mobile network/performance gates.
- Light/dark monthly chart reflow covered 360×800, 768×1024, 1440×900 and
  720×900 viewports, reduced motion and automated accessibility assertions.
  Mobile light and desktop dark screenshots were visually inspected. Run
  evidence is under `e2e/.runs/run_c305f488b4f300df` (local, gitignored).
- Independent implementation review found no actionable defects; reviewer
  independently passed 28 chart/workspace tests.
- Built gzip JavaScript (648.2 KiB) and CSS (14.2 KiB) passed their budgets.
  The full `pnpm quality:budgets` command remains blocked by the unrelated,
  untracked `apps/web/public/branding/login page.png` reference image
  (1885.3 KiB). It exceeds both the per-image and aggregate image limits;
  this issue adds no images and does not alter or remove that user asset.

Manual assistive-technology testing, actual browser 200% zoom and field INP
remain release checks; automated reflow/accessibility and lab interaction
measurements do not certify them. No new export contract is introduced.
