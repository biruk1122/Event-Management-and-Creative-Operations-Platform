import type { components } from "@event-platform/api-client";

export type Share = components["schemas"]["ShareResponse"];
export type ShareScope = Share["scope"];
export type ShareRecipientOption =
  components["schemas"]["ShareRecipientOption"];

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  VIEW: "View only",
  VIEW_AND_DOWNLOAD: "View and download",
};

export function shareAudienceLabel(share: Share): string {
  return share.allEmployees ? "All employees" : (share.recipientName ?? "—");
}
