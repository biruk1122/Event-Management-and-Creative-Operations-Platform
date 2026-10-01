import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReport,
  exportReport,
  getReport,
  listReports,
  ReportsRequestError,
  reviewReport,
  submitReport,
  updateReport,
} from "./reports-gateway";
import type { CreateReport } from "../lib/report-presentation";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch },
}));

const ok = (data: unknown, status = 200) => ({ data, response: { status } });
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { status },
});
const values: CreateReport = {
  type: "DAILY",
  title: "Daily work",
  periodStart: "2024-02-29",
  periodEnd: "2024-02-29",
  problemsEncountered: "Rain",
  nextDayPlan: "Rehearse",
  workspaceIds: ["workspace-1"],
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("reports gateway", () => {
  it("sends only bounded server-side filters and forwards the abort signal", async () => {
    const controller = new AbortController();
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listReports(
      {
        type: "WEEKLY",
        status: "SUBMITTED",
        authorId: "author-1",
        departmentId: "department-1",
        workspaceId: "workspace-1",
        periodFrom: "2024-02-01",
        periodTo: "2024-02-29",
        page: 2,
        pageSize: 10,
      },
      controller.signal,
    );
    expect(get).toHaveBeenCalledWith(
      "/api/v1/reports",
      expect.objectContaining({
        params: {
          query: {
            type: "WEEKLY",
            status: "SUBMITTED",
            authorId: "author-1",
            departmentId: "department-1",
            workspaceId: "workspace-1",
            periodFrom: "2024-02-01",
            periodTo: "2024-02-29",
            page: 2,
            pageSize: 10,
          },
        },
        signal: controller.signal,
        cache: "no-store",
      }),
    );
    get.mockClear();
    await listReports({
      type: null,
      status: null,
      periodFrom: "",
      periodTo: "",
      page: 0,
      pageSize: 1000,
    });
    expect(get.mock.calls[0]?.[1]?.params?.query).toEqual({
      page: 1,
      pageSize: 100,
    });
  });

  it("does not convert denied or missing detail into a visible report", async () => {
    get.mockResolvedValueOnce(fail("PERMISSION_DENIED", 403));
    await expect(getReport("report-1")).rejects.toMatchObject({ status: 403 });
    get.mockResolvedValueOnce(fail("REPORT_NOT_FOUND", 404));
    await expect(exportReport("report-1")).rejects.toMatchObject({
      code: "REPORT_NOT_FOUND",
      status: 404,
    });
  });

  it("uses the CSRF cookie and generated paths for create, edit, submit and review", async () => {
    document.cookie = "csrf_token=token-123; path=/";
    post.mockResolvedValue(ok({ id: "report-1" }));
    patch.mockResolvedValue(ok({ id: "report-1" }));
    await createReport(values);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/reports",
      expect.objectContaining({
        body: values,
        headers: { "x-csrf-token": "token-123" },
      }),
    );
    await updateReport("report-1", values);
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/reports/{id}",
      expect.objectContaining({
        params: { path: { id: "report-1" } },
        body: values,
        headers: { "x-csrf-token": "token-123" },
      }),
    );
    await submitReport("report-1");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/reports/{id}/submit",
      expect.objectContaining({
        params: { path: { id: "report-1" } },
        headers: { "x-csrf-token": "token-123" },
      }),
    );
    await reviewReport("report-1", "CHANGES_REQUESTED", "  More detail  ");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/reports/{id}/reviews",
      expect.objectContaining({
        body: { outcome: "CHANGES_REQUESTED", note: "More detail" },
      }),
    );
  });

  it("maps validation, duplicate, stale, and permission failures without claiming success", async () => {
    post.mockResolvedValueOnce(fail("REPORT_DUPLICATE", 409));
    await expect(createReport(values)).rejects.toThrow(/already have a report/);
    patch.mockResolvedValueOnce(
      fail("VALIDATION_ERROR", 400, { title: ["Title is required"] }),
    );
    await expect(updateReport("report-1", values)).rejects.toMatchObject({
      fieldErrors: { title: "Title is required" },
    });
    post.mockResolvedValueOnce(fail("REPORT_INVALID_SECTIONS", 400));
    await expect(submitReport("report-1")).rejects.toThrow(/required sections/);
    post.mockResolvedValueOnce(fail("REPORT_CONCURRENT_CHANGE", 409));
    await expect(reviewReport("report-1", "REVIEWED", "")).rejects.toThrow(
      /changed while/,
    );
    expect(new ReportsRequestError(401, null, {}).message).toMatch(
      /session expired/,
    );
  });

  it("returns only the authorized export response", async () => {
    const snapshot = { id: "report-1", facts: { completedTasksInPeriod: 3 } };
    get.mockResolvedValue(ok(snapshot));
    expect(await exportReport("report-1")).toEqual(snapshot);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/reports/{id}/export",
      expect.objectContaining({
        params: { path: { id: "report-1" } },
        cache: "no-store",
      }),
    );
  });
});
