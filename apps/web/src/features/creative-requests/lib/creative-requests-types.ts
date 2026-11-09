import type { components } from "@event-platform/api-client";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

export type CreativeRequest = components["schemas"]["CreativeRequestResponse"];
export type PaginatedCreativeRequests =
  components["schemas"]["PaginatedCreativeRequestsResponse"];
export type CreativeRequestFeedback =
  components["schemas"]["CreativeRequestFeedbackResponse"];
export type PaginatedCreativeRequestFeedback =
  components["schemas"]["PaginatedCreativeRequestFeedbackResponse"];
export type CreativeRequestFile =
  components["schemas"]["CreativeRequestFileResponse"];
export type PaginatedCreativeRequestFiles =
  components["schemas"]["PaginatedCreativeRequestFilesResponse"];

export type CreativeRequestStatus = CreativeRequest["status"];
export type CreativeAssetType = CreativeRequest["assetType"];
export type CreativeRequestFileKind = CreativeRequestFile["kind"];
export type CreativeRequestDirection = "SENT" | "RECEIVED";

export const CREATIVE_REQUEST_STATUS_LABELS: Record<
  CreativeRequestStatus,
  string
> = {
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  CANCELLED: "Cancelled",
};

export const CREATIVE_ASSET_TYPE_LABELS: Record<CreativeAssetType, string> = {
  POSTER: "Poster",
  FLYER: "Flyer",
  BANNER: "Banner",
  EVENT_GRAPHIC: "Event graphic",
  VIDEO: "Video",
  ADVERTISING_CONTENT: "Advertising content",
  ARTIST_MATERIAL: "Artist material",
  OTHER: "Other",
};

export const CREATIVE_ASSET_TYPES = Object.keys(
  CREATIVE_ASSET_TYPE_LABELS,
) as CreativeAssetType[];

export const CREATIVE_REQUEST_STATUSES = Object.keys(
  CREATIVE_REQUEST_STATUS_LABELS,
) as CreativeRequestStatus[];

/** The button label for each move a request can make. */
export const CREATIVE_REQUEST_MOVE_LABELS: Partial<
  Record<CreativeRequestStatus, string>
> = {
  ACCEPTED: "Accept",
  DECLINED: "Decline",
  IN_PROGRESS: "Start work",
  DELIVERED: "Deliver",
  APPROVED: "Approve",
  CHANGES_REQUESTED: "Request changes",
  CANCELLED: "Cancel request",
};

export const CREATIVE_REQUEST_FILE_KIND_LABELS: Record<
  CreativeRequestFileKind,
  string
> = {
  REFERENCE: "Reference",
  DELIVERABLE: "Deliverable",
};

function holds(access: CurrentAccess, key: string): boolean {
  return access.grants.some((grant) => grant.permissionKey === key);
}

/**
 * Interface hints only; the API checks every action. Every Department Manager
 * holds `creative_request.create`, but only Promotion sends requests (and
 * Super Admin on its behalf), so the button follows that same rule.
 */
export function creativeRequestAccess(access: CurrentAccess) {
  const sendsRequests =
    access.role === "SUPER_ADMIN" ||
    (access.department?.active === true &&
      access.department.name === "Promotion");
  return {
    canRead: holds(access, "creative_request.read"),
    canCreate: holds(access, "creative_request.create") && sendsRequests,
  };
}
