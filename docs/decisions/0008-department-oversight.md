# 0008 - Department oversight

- Status: Accepted
- Date: 2026-11-08
- Deciders: Product owner, platform architecture
- Linear issue: EVE-229
- Supersedes: none
- Superseded by: none

## Context

Departments were peers. Each Department Manager reached only their own department through
DEPARTMENT-scoped grants. A Department Manager's own reports went to the Admin that Super Admin
designated for the department (`Department.reportingAdminId`).

The Promotional Manager workspace (EVE-229) needs one department to answer to another. The
Promotional Manager reports to the Marketing Manager, and the Marketing Manager oversees Promotion's
work. The Promotional Manager still runs Promotion's operations. Super Admin keeps full oversight.
Neither manager is a new role: each is the Department Manager of their department.

## Decision

1. **A department may name one overseeing department.**
   - The link is stored in `departments.oversight_department_id`, a nullable self reference.
   - It is one level only. A database trigger refuses a link to itself, a link to a department
     that is itself overseen, and overseeing while being overseen.
   - The first link, Promotion overseen by Marketing, is migration data.
   - A NULL link keeps every existing department exactly as it was.

2. **The overseeing department's manager reads; they never write.**
   - The overseer is the active Department Manager who is the recorded `Department.managerId` of
     the overseeing department.
   - They can read the overseen department's campaigns, campaign budgets, tasks, partners,
     expenses and reports.
   - The keys this reaches are fixed in `OVERSIGHT_READ_PERMISSION_KEYS`, and they widen access
     only for a user who already holds that key at DEPARTMENT scope.
   - No write key is ever widened, so every create, update, assignment, transition, submission,
     approval and deletion keeps its own-department check.
   - Team members of the overseeing department gain nothing.
   - The access is one-way: the overseen department gains nothing over the overseeing one.

3. **Report routing follows the link.**
   - A Department Manager's report from an overseen department goes to the overseeing
     department's active manager.
   - If that manager is missing or inactive, the report falls back to the department's reporting
     Admin, as before, and is refused only if neither exists.
   - Review authority is unchanged: the recipient or Super Admin reviews, never the author.
   - The overseer may load an overseen report to review it, but `canReviewReport` still limits the
     decision to reports addressed to them.

4. **Clients learn the link from `GET /auth/me/permissions`.**
   - The response carries `overseenDepartments`, so the web app can open overseen records
     read-only.
   - The API remains the boundary; the UI only hides controls the API would refuse.

5. **Promotion campaigns gain approval and pause.**
   - `APPROVED` and `PAUSED` are promotion-only. The `campaigns_promotion_only_statuses` CHECK
     keeps them off marketing rows.
   - Only Super Admin or Admin makes the PLANNED → APPROVED move, so a Promotional Manager cannot
     approve their own campaign.
   - Admin holds `campaign.read` and `campaign.transition_status` at organization scope only to
     approve; the service refuses every other move by Admin.
   - Marketing's lifecycle is unchanged.

## Consequences

- Oversight is data, not a role. Adding another overseen department later is a data change
  reviewed like any other; no API to edit the link exists yet.
- Read paths in campaigns, tasks, partners, expenses and reports each merge the overseen
  department ids into their visibility filter. Any new module that should be overseen must opt in
  the same way, and must add its read key to `OVERSIGHT_READ_PERMISSION_KEYS` deliberately.
- Tasks, partners and reports owned only by a workspace and not by a department are outside
  oversight.
- Rejected alternatives:
  - Making the Marketing Manager the Promotion `reportingAdminId`. The column is reserved for
    Admins, and that would grant no read access.
  - A new "Promotional Manager" role. It would duplicate Department Manager and break the
    four-role model.
