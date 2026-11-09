import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

export const PROMOTION_ERROR = {
  campaignNotFound: "PROMOTION_CAMPAIGN_NOT_FOUND",
  activityNotFound: "PROMOTION_ACTIVITY_NOT_FOUND",
  detailConflict: "PROMOTION_DETAIL_CONFLICT",
  assignmentConflict: "PROMOTION_ASSIGNMENT_CONFLICT",
  assignmentNotFound: "PROMOTION_ASSIGNMENT_NOT_FOUND",
  talentNotFound: "TALENT_NOT_FOUND",
  duplicateTalent: "PROMOTION_DUPLICATE_TALENT",
  assigneeInvalid: "PROMOTION_ASSIGNEE_INVALID",
  assigneeConflict: "PROMOTION_ASSIGNEE_CONFLICT",
  assigneeNotFound: "PROMOTION_ASSIGNEE_NOT_FOUND",
} as const;

export const promotionCampaignNotFound = () =>
  new NotFoundException({
    code: PROMOTION_ERROR.campaignNotFound,
    detail: "Promotion campaign not found.",
  });
export const promotionActivityNotFound = () =>
  new NotFoundException({
    code: PROMOTION_ERROR.activityNotFound,
    detail: "Promotion activity not found in this campaign.",
  });
export const promotionDetailConflict = () =>
  new ConflictException({
    code: PROMOTION_ERROR.detailConflict,
    detail: "Promotion details already exist for this activity.",
  });
export const promotionAssignmentConflict = () =>
  new ConflictException({
    code: PROMOTION_ERROR.assignmentConflict,
    detail: "Talent is already assigned to this activity.",
  });
export const promotionAssignmentNotFound = () =>
  new NotFoundException({
    code: PROMOTION_ERROR.assignmentNotFound,
    detail: "Talent is not assigned to this activity.",
  });
export const promotionTalentNotFound = () =>
  new NotFoundException({
    code: PROMOTION_ERROR.talentNotFound,
    detail: "Talent not found.",
  });
/** EVE-231: only an active employee of the campaign's department can work an activity. */
export const promotionAssigneeInvalid = () =>
  new ConflictException({
    code: PROMOTION_ERROR.assigneeInvalid,
    detail:
      "Only an active employee of the campaign's department can be assigned to this activity.",
  });
export const promotionAssigneeConflict = () =>
  new ConflictException({
    code: PROMOTION_ERROR.assigneeConflict,
    detail: "That employee is already assigned to this activity.",
  });
export const promotionAssigneeNotFound = () =>
  new NotFoundException({
    code: PROMOTION_ERROR.assigneeNotFound,
    detail: "That employee is not assigned to this activity.",
  });
export const promotionDuplicateTalent = () =>
  new BadRequestException({
    code: PROMOTION_ERROR.duplicateTalent,
    detail: "Each talent may appear only once in an activity.",
  });
