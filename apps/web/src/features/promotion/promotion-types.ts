import type { components } from "@event-platform/api-client";

export type PromotionActivity =
  components["schemas"]["PromotionActivityResponse"];
export type PromotionChannel = PromotionActivity["channel"];

export const PROMOTION_CHANNELS: readonly PromotionChannel[] = [
  "CONTENT_CREATION",
  "SOCIAL_MEDIA",
  "INFLUENCER_MARKETING",
  "RADIO_PROMOTION",
  "TELEVISION",
  "SCREENS_DIGITAL_MEDIA",
  "ADVERTISING",
];

export const PROMOTION_CHANNEL_LABELS: Record<PromotionChannel, string> = {
  CONTENT_CREATION: "Content creation",
  SOCIAL_MEDIA: "Social media",
  INFLUENCER_MARKETING: "Influencer marketing",
  RADIO_PROMOTION: "Radio promotion",
  TELEVISION: "Television",
  SCREENS_DIGITAL_MEDIA: "Screens and digital media",
  ADVERTISING: "Advertising",
};
