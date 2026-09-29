# Marketing campaign API (EVE-160)

Marketing is an extension of the shared campaign platform. A strategy is
content of one `MARKETING` campaign, not a separate campaign or lifecycle.
All routes below use the `/api/v1` prefix.

| Operation                                                            | Route                                                          | Permission                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Create a marketing campaign                                          | `POST /campaigns` with `campaignType: MARKETING`               | `campaign.create`                         |
| List/get marketing campaigns and progress                            | `GET /campaigns?campaignType=MARKETING`, `GET /campaigns/{id}` | `campaign.read`                           |
| Update campaign details, status, team, manager, activities or budget | Existing `/campaigns/{id}` subroutes                           | Their documented `campaign.*` permissions |
| Read strategy                                                        | `GET /marketing/campaigns/{id}/strategy`                       | `campaign.read`                           |
| Attach strategy                                                      | `POST /marketing/campaigns/{id}/strategy`                      | `campaign.read`, `campaign.update`        |
| Replace strategy text                                                | `PATCH /marketing/campaigns/{id}/strategy`                     | `campaign.read`, `campaign.update`        |
| Remove strategy, retaining the campaign                              | `DELETE /marketing/campaigns/{id}/strategy`                    | `campaign.read`, `campaign.update`        |

The strategy mutation body is `{ "strategy": "..." }`: nonblank text, at most
2,000 characters, trimmed before storage. Only one strategy may be attached to
a marketing campaign. A second attach returns `409
MARKETING_STRATEGY_CONFLICT`; a missing strategy returns `404
MARKETING_STRATEGY_NOT_FOUND`; a non-marketing campaign returns `404
MARKETING_CAMPAIGN_NOT_FOUND`. Authentication, CSRF on mutations, organization-
scoped grants, and standard Problem Details with request IDs apply. Shared
campaign lifecycle transitions use the existing campaign transition route;
strategy operations never change campaign state.
Changing a campaign's type while its strategy exists returns `409
CAMPAIGN_TYPE_CONFLICT`; remove the strategy first.

Shared campaign records own money, audience, dates, status, activities,
progress, workspace teams, and assignments. Marketing never writes those
tables directly. Current progress is the shared campaign activity-derived
measure; additional performance inputs and formulas await OD-13 and are not
defined by this API slice. Each strategy mutation is one atomic database
statement; no cross-module multi-record transaction is needed.
