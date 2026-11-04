import { OmitType, PartialType } from "@nestjs/swagger";

import { CreateTalentDto } from "./create-talent.dto.js";

/**
 * Profile-only patch. Availability changes use the explicit transition route,
 * the manager has its own route, and social links are added separately.
 */
export class UpdateTalentDto extends PartialType(
  OmitType(CreateTalentDto, [
    "managerId",
    "availability",
    "socialLink",
  ] as const),
) {}
