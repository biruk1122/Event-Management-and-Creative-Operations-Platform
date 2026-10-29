import {
  BadRequestException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

/** Stable Problem Details codes for the partner (sponsor/media/partnership)
 * directory surface. */
export const PARTNER_ERROR = {
  partnerNotFound: "PARTNER_NOT_FOUND",
  partnerDepartmentNotFound: "PARTNER_DEPARTMENT_NOT_FOUND",
  partnerCampaignNotFound: "PARTNER_CAMPAIGN_NOT_FOUND",
  /** The same code the events surface uses for its own not-found. */
  eventNotFound: "EVENT_NOT_FOUND",
  partnerOwnerOutsideDepartment: "PARTNER_OWNER_OUTSIDE_DEPARTMENT",
} as const;

export function partnerNotFound(): HttpException {
  return new NotFoundException({
    code: PARTNER_ERROR.partnerNotFound,
    error: "Not Found",
    detail: "No partner exists with that id.",
  });
}

export function partnerDepartmentNotFound(): HttpException {
  return new NotFoundException({
    code: PARTNER_ERROR.partnerDepartmentNotFound,
    error: "Not Found",
    detail: "No department exists with that id.",
  });
}

export function partnerCampaignNotFound(): HttpException {
  return new NotFoundException({
    code: PARTNER_ERROR.partnerCampaignNotFound,
    error: "Not Found",
    detail: "No campaign exists with that id.",
  });
}

export function partnerRelatedEventNotFound(): HttpException {
  return new NotFoundException({
    code: PARTNER_ERROR.eventNotFound,
    error: "Not Found",
    detail: "No event exists with that id.",
  });
}

export function partnerOwnerOutsideDepartment(): HttpException {
  return new BadRequestException({
    code: PARTNER_ERROR.partnerOwnerOutsideDepartment,
    error: "Bad Request",
    detail: "That user does not belong to this partner's department.",
  });
}
