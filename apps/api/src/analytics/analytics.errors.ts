import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

export const analyticsInvalidRange = () =>
  new BadRequestException({
    code: "ANALYTICS_INVALID_RANGE",
    detail:
      "Use real UTC dates with from < toExclusive, at most 366 days; monthly ranges must span 1–12 whole calendar months.",
  });
export const analyticsInvalidPage = () =>
  new BadRequestException({
    code: "ANALYTICS_INVALID_PAGE",
    detail: "Page size must be 1–100 and offset must not exceed 10000.",
  });
export const analyticsUnavailable = () =>
  new ServiceUnavailableException({
    code: "ANALYTICS_UNAVAILABLE",
    detail:
      "Analytics could not be calculated within the read budget. Retry later.",
  });
