import type { PaginatedCampaigns } from "../lib/campaigns-types";
import { FIXTURE_PAGE } from "./fixtures";

export interface ListCampaignsQuery {
  page?: number;
}

export type ListCampaigns = (
  query: ListCampaignsQuery,
) => Promise<PaginatedCampaigns>;

/**
 * Placeholder for `GET /api/v1/campaigns`. CAM-05 replaces the body with a
 * real `@event-platform/api-client` call, server-driven filters, and TanStack
 * Query wiring. Until then it returns a fixed fixture page so the surface and
 * its client-side filters can be built and tested.
 */
export const listCampaigns: ListCampaigns = () => Promise.resolve(FIXTURE_PAGE);
