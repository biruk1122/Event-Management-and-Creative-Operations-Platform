import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";

/**
 * A campaign's updates log and recorded metrics (EVE-231). Both are read with
 * campaign.read and written with campaign.update; the server checks the write
 * against the campaign's own department, so the read-only overseer gets a
 * refusal rather than a control that works.
 */
export type CampaignUpdate = components["schemas"]["CampaignUpdateResponse"];
export type CampaignUpdatePage =
  components["schemas"]["PaginatedCampaignUpdatesResponse"];
export type CampaignMetric = components["schemas"]["CampaignMetricResponse"];
export type CampaignMetricPage =
  components["schemas"]["PaginatedCampaignMetricsResponse"];
export type CampaignMetricKey = CampaignMetric["key"];

export type CampaignDetailWriteResult<T> =
  { status: "success"; value: T } | { status: "failed"; message: string };

const PAGE_SIZE = 25;

const headers = () => {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
};

/** Plain-language copy for the write failures a viewer can cause. */
function failureMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403)
    return "You do not have permission to change this campaign.";
  if (status === 404) return "This campaign is no longer available.";
  if (status === 400) return "Check the entries and try again.";
  return "We could not save that change. Try again.";
}

export async function listCampaignUpdates(
  campaignId: string,
  page = 1,
  signal?: AbortSignal,
): Promise<CampaignUpdatePage | null> {
  const { data } = await browserApi.GET("/api/v1/campaigns/{id}/updates", {
    params: {
      path: { id: campaignId },
      query: { page, pageSize: PAGE_SIZE } as never,
    },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

export async function addCampaignUpdate(
  campaignId: string,
  note: string,
): Promise<CampaignDetailWriteResult<CampaignUpdate>> {
  const { data, response } = await browserApi.POST(
    "/api/v1/campaigns/{id}/updates",
    {
      params: { path: { id: campaignId } },
      body: { note },
      headers: headers(),
    },
  );
  return data
    ? { status: "success", value: data }
    : { status: "failed", message: failureMessage(response.status) };
}

export async function listCampaignMetrics(
  campaignId: string,
  page = 1,
  signal?: AbortSignal,
): Promise<CampaignMetricPage | null> {
  const { data } = await browserApi.GET("/api/v1/campaigns/{id}/metrics", {
    params: {
      path: { id: campaignId },
      query: { page, pageSize: PAGE_SIZE } as never,
    },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

export type RecordMetricValues = {
  key: CampaignMetricKey;
  /** The value exactly as typed, with at most two decimal places. */
  value: number;
  /** YYYY-MM-DD */
  recordedOn: string;
  sourceNote: string | null;
};

export async function recordCampaignMetric(
  campaignId: string,
  values: RecordMetricValues,
): Promise<CampaignDetailWriteResult<CampaignMetric>> {
  const { data, response } = await browserApi.POST(
    "/api/v1/campaigns/{id}/metrics",
    {
      params: { path: { id: campaignId } },
      body: {
        key: values.key,
        value: values.value,
        recordedOn: values.recordedOn,
        ...(values.sourceNote ? { sourceNote: values.sourceNote } : {}),
      },
      headers: headers(),
    },
  );
  return data
    ? { status: "success", value: data }
    : { status: "failed", message: failureMessage(response.status) };
}
