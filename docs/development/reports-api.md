# Reports API (EVE-166)

All routes are under `/api/v1/reports`, require the access cookie, and use the
existing CSRF token for mutations. Input failures return Problem Details with a
stable `code` and the request ID is returned as `x-request-id`. Dates are UTC
calendar dates (`YYYY-MM-DD`).

| Command/query               | Permission      | Behavior                                                                                                                                                                                                                                                  |
| --------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /reports`             | `report.create` | Create a draft owned by the caller. An author may have one report per type and period start.                                                                                                                                                              |
| `PATCH /reports/:id`        | `report.create` | Author-only edit of Draft or Changes Requested; the latter reopens as Draft and retains review history.                                                                                                                                                   |
| `POST /reports/:id/submit`  | `report.submit` | Author-only; requires all type-specific narrative sections; Draft or Changes Requested becomes Submitted.                                                                                                                                                 |
| `POST /reports/:id/reviews` | `report.review` | Organization-scope reviewer, other than the author, records Reviewed or Changes Requested with an optional note.                                                                                                                                          |
| `GET /reports`              | `report.read`   | Scoped list with type, status, author, department, workspace, and period-start filters. Sorted by period start then ID descending. `page` 1–100000; `pageSize` 1–100. Period filters must be provided together, ordered, and no more than 366 days apart. |
| `GET /reports/:id`          | `report.read`   | Detail, immutable review history, workspace IDs, and live derived facts.                                                                                                                                                                                  |
| `GET /reports/:id/export`   | `report.read`   | JSON snapshot of the authorized detail, audited as `report.exported`.                                                                                                                                                                                     |

Organization grants see all reports. Department grants see reports in the
caller's current department. Self grants see only reports they authored. The
same scope test runs in the service for individual reads and mutations; a
non-organization caller receives the same denial for an absent or out-of-scope
ID. Only the author can edit or submit, even if someone else has a broader
`report.create` or `report.submit` grant. Workspace links require the author
to pass the workspace module's read authorization at write time. No report
field accepts a client-computed task, project, or performance total.

Daily periods are one date; weekly periods are seven inclusive dates; monthly
periods are a whole calendar month. Draft sections may be incomplete. At
submission, Daily requires problems encountered and next-day plan; Weekly
requires department activities, major achievements, challenges, and next-week
plan; Monthly requires major achievements, challenges, department performance,
and employee performance. Textual performance is narrative, not a score.

The detail's `facts` are computed by Tasks and Projects from authoritative
rows. `completedTasksInPeriod` is the count of distinct tasks currently
created by or assigned to the report author with a `STATUS_CHANGED` transition
to `COMPLETED` during the UTC period. `inProgressTasksNow` counts current
`IN_PROGRESS` tasks; `pendingTasksNow` counts current `TODO`, `IN_PROGRESS`,
`UNDER_REVIEW`, or `BLOCKED` tasks; `overdueTasksNow` counts the same open tasks
whose due instant is before `facts.asOf`. All task counts are author-scoped, not
department totals. Monthly reports additionally show current non-cancelled,
completed, and active project counts for projects the author created or
manages. On Daily and Weekly these project fields are `null`. The current
counts are intentionally live, so they can change after report submission;
they are not historical snapshots or performance scores. A task's current
assignment controls whether it contributes to historical completion count.

Submission, review, and export write canonical audit actions. Report reminder
lead time and the expected-submitter population are still open under ADR 0003
NT-01/NT-02; this API does not schedule or address reminders by guessing those
policies. Likewise OD-13 leaves a performance scoring formula open. Once those
decisions are approved, a separately scoped issue can add scheduler behavior
and scores without altering the report lifecycle contract.
