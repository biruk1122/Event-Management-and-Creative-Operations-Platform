import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportRecord } from "../src/reports/infrastructure/reports.repository.js";
import { ReportsService } from "../src/reports/reports.service.js";

const ACTOR = "actor-1";
const OTHER = "actor-2";

function makeReport(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "report-1",
    type: "DAILY",
    title: "Daily report",
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    authorId: ACTOR,
    departmentId: null,
    status: "DRAFT",
    problemsEncountered: null,
    nextDayPlan: null,
    departmentActivities: null,
    majorAchievements: null,
    challenges: null,
    nextWeekPlan: null,
    departmentPerformance: null,
    employeePerformance: null,
    lessonsLearned: null,
    recommendations: null,
    submittedAt: null,
    reviewedAt: null,
    reviewerId: null,
    workspaces: [],
    reviews: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  } as unknown as ReportRecord;
}

describe("ReportsService.get - EOM-01 post-event facts", () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: { getEffectiveGrants: ReturnType<typeof vi.fn> };
  let eventFacts: { forWorkspace: ReturnType<typeof vi.fn> };
  let expenseFacts: { forWorkspace: ReturnType<typeof vi.fn> };
  let service: ReportsService;

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(makeReport()),
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
    };
    permissions = {
      getEffectiveGrants: vi
        .fn()
        .mockResolvedValue([
          { permissionKey: "report.read", scope: "ORGANIZATION" },
        ]),
    };
    const taskFacts = {
      forAuthor: vi.fn().mockResolvedValue({
        completedInPeriod: 0,
        inProgressNow: 0,
        pendingNow: 0,
        overdueNow: 0,
      }),
    };
    const projectFacts = { forAuthor: vi.fn() };
    eventFacts = { forWorkspace: vi.fn() };
    expenseFacts = { forWorkspace: vi.fn() };
    service = new ReportsService(
      repo as never,
      permissions as never,
      {} as never,
      {} as never,
      taskFacts as never,
      projectFacts as never,
      eventFacts as never,
      expenseFacts as never,
    );
  });

  it("leaves event/budget facts null for a non-POST_EVENT report", async () => {
    repo.findById!.mockResolvedValue(makeReport({ type: "DAILY" }));
    const result = await service.get(ACTOR, "report-1");
    expect(result.facts.eventTotalTasksNow).toBeNull();
    expect(result.facts.eventActualApproved).toBeNull();
    expect(eventFacts.forWorkspace).not.toHaveBeenCalled();
    expect(expenseFacts.forWorkspace).not.toHaveBeenCalled();
  });

  it("leaves event/budget facts null for a POST_EVENT report with no linked workspace", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ type: "POST_EVENT", workspaces: [] }),
    );
    const result = await service.get(ACTOR, "report-1");
    expect(result.facts.eventTotalTasksNow).toBeNull();
    expect(eventFacts.forWorkspace).not.toHaveBeenCalled();
  });

  it("merges live event task counts and keeps approved/pending budget separate", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({
        type: "POST_EVENT",
        workspaces: [{ workspaceId: "ws-1" }],
      }),
    );
    eventFacts.forWorkspace.mockResolvedValue({
      totalTasksNow: 10,
      completedTasksNow: 7,
      incompleteTasksNow: 3,
    });
    expenseFacts.forWorkspace.mockResolvedValue({
      plannedAmount: "5000.00",
      currency: "USD",
      actualApproved: "3200.00",
      actualPending: "900.00",
    });
    const result = await service.get(ACTOR, "report-1");
    expect(eventFacts.forWorkspace).toHaveBeenCalledWith("ws-1");
    expect(expenseFacts.forWorkspace).toHaveBeenCalledWith("ws-1");
    expect(result.facts).toMatchObject({
      eventTotalTasksNow: 10,
      eventCompletedTasksNow: 7,
      eventIncompleteTasksNow: 3,
      eventPlannedAmount: "5000.00",
      eventBudgetCurrency: "USD",
      eventActualApproved: "3200.00",
      eventActualPending: "900.00",
    });
    // The defining correctness property: pending spend is never folded into
    // approved spend, even when both are non-zero for the same event.
    expect(result.facts.eventActualApproved).not.toBe(
      result.facts.eventActualPending,
    );
  });

  it("returns lessonsLearned/recommendations in the response (Phase 1 gap)", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({
        type: "POST_EVENT",
        lessonsLearned: "Book the venue earlier.",
        recommendations: "Add a buffer day.",
      }),
    );
    const result = await service.get(ACTOR, "report-1");
    expect(result.lessonsLearned).toBe("Book the venue earlier.");
    expect(result.recommendations).toBe("Add a buffer day.");
  });
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code: string }).code,
    ).toBe(code);
  });
}

describe("ReportsService - optional Under Review step (EOM-01)", () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: { getEffectiveGrants: ReturnType<typeof vi.fn> };
  let service: ReportsService;

  beforeEach(() => {
    repo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          makeReport({ status: "SUBMITTED", authorId: OTHER }),
        ),
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
      startReview: vi
        .fn()
        .mockResolvedValue(makeReport({ status: "UNDER_REVIEW" })),
      review: vi.fn().mockResolvedValue(makeReport({ status: "REVIEWED" })),
    };
    permissions = {
      getEffectiveGrants: vi
        .fn()
        .mockResolvedValue([
          { permissionKey: "report.review", scope: "ORGANIZATION" },
        ]),
    };
    service = new ReportsService(
      repo as never,
      permissions as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it("moves a submitted report to Under Review", async () => {
    const result = await service.startReview(ACTOR, "report-1", "req-1");
    expect(result.status).toBe("UNDER_REVIEW");
    expect(repo.startReview).toHaveBeenCalledWith(
      "report-1",
      expect.any(Date),
      ACTOR,
      "req-1",
    );
  });

  it("rejects starting review on a non-submitted report", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ status: "DRAFT", authorId: OTHER }),
    );
    await expectCode(
      service.startReview(ACTOR, "report-1", "req-1"),
      "REPORT_INVALID_TRANSITION",
    );
    expect(repo.startReview).not.toHaveBeenCalled();
  });

  it("blocks the author from starting review on their own report", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ status: "SUBMITTED", authorId: ACTOR }),
    );
    await expectCode(
      service.startReview(ACTOR, "report-1", "req-1"),
      "PERMISSION_DENIED",
    );
  });

  it("allows the final decision to be made directly from SUBMITTED, skipping Under Review", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ status: "SUBMITTED", authorId: OTHER }),
    );
    const result = await service.review(
      ACTOR,
      "report-1",
      { outcome: "REVIEWED" },
      "req-1",
    );
    expect(result.status).toBe("REVIEWED");
  });

  it("allows the final decision to be made from Under Review", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ status: "UNDER_REVIEW", authorId: OTHER }),
    );
    const result = await service.review(
      ACTOR,
      "report-1",
      { outcome: "REVIEWED" },
      "req-1",
    );
    expect(result.status).toBe("REVIEWED");
  });

  it("rejects a final decision on a draft report", async () => {
    repo.findById!.mockResolvedValue(
      makeReport({ status: "DRAFT", authorId: OTHER }),
    );
    await expectCode(
      service.review(ACTOR, "report-1", { outcome: "REVIEWED" }, "req-1"),
      "REPORT_INVALID_TRANSITION",
    );
    expect(repo.review).not.toHaveBeenCalled();
  });
});
