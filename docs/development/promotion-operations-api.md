# Promotion operations API (EVE-154)

Promotion is an extension of the shared campaign platform. All routes below are under
`/api/v1`, require an authenticated session, and return RFC 9457 Problem Details on
failure. Mutations also require a CSRF token. Promotion routes accept only campaigns
whose `campaignType` is `PROMOTION`; they do not expose marketing activities.

## Commands and queries

| Operation                                                           | Route                                                                      | Required permission                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create promotion campaign                                           | `POST /campaigns` with `campaignType: PROMOTION`                           | `campaign.create`                                                                |
| Update campaign, manager, teams, budget, lifecycle                  | Existing `/campaigns/:id` routes                                           | Corresponding `campaign.*` key                                                   |
| Create scheduled/shared activity                                    | `POST /campaigns/:id/activities`                                           | `campaign.activity.manage`                                                       |
| Change activity schedule or status                                  | `PATCH /campaigns/:id/activities/:activityId`                              | `campaign.activity.manage`                                                       |
| List promotion activities                                           | `GET /promotion/campaigns/:id/activities?page=&pageSize=&status=`          | `campaign.read`                                                                  |
| Read promotion activity                                             | `GET /promotion/campaigns/:id/activities/:activityId`                      | `campaign.read`                                                                  |
| Attach channel and optional initial talent assignments              | `POST /promotion/campaigns/:id/activities/:activityId`                     | `campaign.read`, `campaign.activity.manage`; `talent.assign` if talents supplied |
| Change delivery channel                                             | `PATCH /promotion/campaigns/:id/activities/:activityId`                    | `campaign.read`, `campaign.activity.manage`                                      |
| Remove promotion details and assignments, retaining shared activity | `DELETE /promotion/campaigns/:id/activities/:activityId`                   | `campaign.read`, `campaign.activity.manage`                                      |
| Assign talent                                                       | `POST /promotion/campaigns/:id/activities/:activityId/talents`             | `campaign.read`, `campaign.activity.manage`, `talent.assign`                     |
| Unassign talent                                                     | `DELETE /promotion/campaigns/:id/activities/:activityId/talents/:talentId` | `campaign.read`, `campaign.activity.manage`, `talent.assign`                     |

To plan a promotion activity, create a shared campaign activity, then attach the
promotion detail with one of the seven approved channels. The attachment and its
optional initial talent assignments commit in one database transaction. Each
later command is an atomic database mutation. A failed attachment leaves the
shared activity available for retry; it does not delete it. Removing the shared
activity through the campaign API cascades its promotion details and assignments.

The shared activity owns name, description, schedule, and status. Its status has
no restricted transition graph: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, and
`CANCELLED` are the approved values. Campaign lifecycle transitions use the
existing campaign policy. Campaign budget, event/product subject, manager, teams,
calendar, discussion, tasks, and reports remain attached through the campaign
and connected workspace; the promotion API does not duplicate them.

Invalid DTO values return 400, missing campaign/activity/talent or promotion
detail returns 404, duplicate detail/assignment returns 409, and insufficient
permissions return 403. The service checks organization-scoped grants as well
as the transport guard. Composite database foreign keys remain the final guard
against assigning details to another campaign or a marketing campaign.
