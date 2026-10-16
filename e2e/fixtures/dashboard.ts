import type { Locator, Page } from "@playwright/test";

/**
 * Locates a dashboard or pinned-analytics card by its visible title.
 *
 * The shadcn `Card` primitive renders a plain, unlabelled `<section>` (no
 * `role="article"`, no accessible name) - labelling it would collide with
 * other named regions on the page (see `dashboard-workspace.test.tsx`'s own
 * "no aria-labelledby on Card" note). Every card still carries a unique
 * `data-slot="card"` wrapper and an `<h3>`/`<h2>` title, so this locates the
 * nearest such wrapper containing that heading instead of an ARIA role.
 */
export function cardByTitle(page: Page, title: string): Locator {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/**
 * Scopes queries to the Analytics page's single-measure dropdown's own
 * filter form - a labelled `<form>`, exposed with role "form". Needed once
 * task completion, department performance and monthly activity became
 * permanently pinned panels with their own identically-labelled "Apply
 * filters" controls: an unscoped `getByRole("button", { name: "Apply
 * filters" })` now matches up to four elements on one page.
 */
export function dropdownForm(page: Page, measureLabel: string): Locator {
  return page.getByRole("form", { name: `${measureLabel} filters` });
}

/** Scopes queries to the dropdown's own results section (an ARIA region,
 * since `AnalyticsWorkspace` labels it) - for the same reason as
 * `dropdownForm`, now that pinned panels render their own tables/charts. */
export function dropdownResults(page: Page, measureLabel: string): Locator {
  return page.getByRole("region", { name: measureLabel });
}
