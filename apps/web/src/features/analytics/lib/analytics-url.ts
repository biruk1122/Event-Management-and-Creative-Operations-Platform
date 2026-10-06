import {
  EMPTY_FILTERS,
  MEASURES,
  filterError,
  isPaged,
  needsPeriod,
  type AnalyticsFilters,
  type Measure,
} from "./analytics-presentation";

export interface AnalyticsSelection {
  measure: Measure;
  filters: AnalyticsFilters;
  page: number;
}
export function defaultFilters(now = new Date()): AnalyticsFilters {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    ...EMPTY_FILTERS,
    from: start.toISOString().slice(0, 10),
    toExclusive: end.toISOString().slice(0, 10),
  };
}
export function readSelection(
  params: Pick<URLSearchParams, "get">,
  fallback: Measure,
  defaults: AnalyticsFilters,
) {
  const requested = params.get("measure");
  const measure =
    requested && Object.hasOwn(MEASURES, requested)
      ? (requested as Measure)
      : fallback;
  const filters = {
    from: needsPeriod(measure)
      ? (params.get("from") ?? defaults.from)
      : defaults.from,
    toExclusive: needsPeriod(measure)
      ? (params.get("toExclusive") ?? defaults.toExclusive)
      : defaults.toExclusive,
    subjectId:
      measure !== "tasks" && measure !== "monthly"
        ? (params.get("subjectId") ?? "")
        : "",
    pageSize: isPaged(measure) ? Number(params.get("pageSize") ?? "25") : 25,
  };
  const page = isPaged(measure) ? Number(params.get("page") ?? "1") : 1;
  const error =
    requested && !Object.hasOwn(MEASURES, requested)
      ? "Unknown analytics measure. Choose a supported view."
      : (filterError(measure, filters) ??
        (!Number.isSafeInteger(page) ||
        page < 1 ||
        (page - 1) * filters.pageSize > 10000
          ? "Invalid page. Use a positive page within the 10,000-row offset limit."
          : null));
  return { measure, filters, page, error };
}
export function selectionUrl({ measure, filters, page }: AnalyticsSelection) {
  const params = new URLSearchParams({ measure });
  if (needsPeriod(measure)) {
    params.set("from", filters.from);
    params.set("toExclusive", filters.toExclusive);
  }
  if (measure !== "tasks" && measure !== "monthly" && filters.subjectId)
    params.set("subjectId", filters.subjectId);
  if (isPaged(measure)) {
    params.set("page", String(page));
    params.set("pageSize", String(filters.pageSize));
  }
  return `/analytics?${params}` as const;
}
