import type { components, operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CreateReport,
  ReportDetail,
  ReportFilters,
  ReportList,
  ReviewOutcome,
} from "../lib/report-presentation";

type ListQuery = NonNullable<
  operations["Reports_list_v1"]["parameters"]["query"]
>;
type ReviewReport = components["schemas"]["ReviewReportDto"];

const MESSAGES: Readonly<Record<string, string>> = {
  REPORT_INVALID_PERIOD: "The dates do not match the selected report type.",
  REPORT_INVALID_SECTIONS:
    "Complete the required sections for this report type.",
  REPORT_INVALID_RANGE: "Choose a valid period range of at most 366 days.",
  REPORT_DUPLICATE: "You already have a report of this type for this period.",
  REPORT_INVALID_TRANSITION:
    "This report has changed state. Refresh and try again.",
  REPORT_CONCURRENT_CHANGE:
    "This report changed while you were editing. Refresh and try again.",
  REPORT_WORKSPACE_NOT_FOUND: "A linked workspace is no longer available.",
  REPORT_NOT_FOUND: "This report is no longer available. Refresh the list.",
  VALIDATION_ERROR: "Check the report fields and try again.",
};

export class ReportsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly fieldErrors: Readonly<Record<string, string>>,
  ) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have permission to view or change this report."
          : code && MESSAGES[code]
            ? MESSAGES[code]
            : status === 404
              ? "This report is no longer available. Refresh the list."
              : "We could not complete the report request. Try again.",
    );
    this.name = "ReportsRequestError";
  }
}

function requestError(error: unknown, status: number): ReportsRequestError {
  const problem = isProblemDetails(error) ? error : null;
  return new ReportsRequestError(
    status,
    problem?.code ?? null,
    fieldErrorsOf(problem),
  );
}

function csrfHeaders() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export interface ListReportsParams extends ReportFilters {
  page: number;
  pageSize: number;
}

export async function listReports(
  params: ListReportsParams,
  signal?: AbortSignal,
): Promise<ReportList> {
  const query: Record<string, string | number> = {
    page: Math.min(100_000, Math.max(1, Math.trunc(params.page))),
    pageSize: Math.min(100, Math.max(1, Math.trunc(params.pageSize))),
  };
  if (params.type) query.type = params.type;
  if (params.status) query.status = params.status;
  if (params.authorId) query.authorId = params.authorId;
  if (params.departmentId) query.departmentId = params.departmentId;
  if (params.workspaceId) query.workspaceId = params.workspaceId;
  if (params.periodFrom && params.periodTo) {
    query.periodFrom = params.periodFrom;
    query.periodTo = params.periodTo;
  }

  const { data, error, response } = await browserApi.GET("/api/v1/reports", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function getReport(
  id: string,
  signal?: AbortSignal,
): Promise<ReportDetail> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/reports/{id}",
    {
      params: { path: { id } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function createReport(values: CreateReport) {
  const { data, error, response } = await browserApi.POST("/api/v1/reports", {
    body: values,
    headers: csrfHeaders(),
  });
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function updateReport(id: string, values: CreateReport) {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/reports/{id}",
    { params: { path: { id } }, body: values, headers: csrfHeaders() },
  );
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function submitReport(id: string) {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/reports/{id}/submit",
    { params: { path: { id } }, headers: csrfHeaders() },
  );
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function reviewReport(
  id: string,
  outcome: ReviewOutcome,
  note: string,
) {
  const body: ReviewReport = {
    outcome,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const { data, error, response } = await browserApi.POST(
    "/api/v1/reports/{id}/reviews",
    { params: { path: { id } }, body, headers: csrfHeaders() },
  );
  if (!data) throw requestError(error, response.status);
  return data;
}

export async function exportReport(id: string): Promise<ReportDetail> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/reports/{id}/export",
    { params: { path: { id } }, cache: "no-store" },
  );
  if (!data) throw requestError(error, response.status);
  return data;
}
