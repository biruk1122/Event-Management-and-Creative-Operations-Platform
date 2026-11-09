-- EVE-234: campaign completion reports (a new report type linked to the campaign's
-- workspace through report_workspaces). Additive: an enum value only; no row or
-- check changes. Adding a value is safe here because nothing in this
-- transaction uses it.
ALTER TYPE "report_type" ADD VALUE 'CAMPAIGN_COMPLETION';
