import { OmitType, PartialType } from "@nestjs/swagger";

import { CreateTalentDto } from "./create-talent.dto.js";

/** Profile-only patch. Availability changes use the explicit transition route. */
export class UpdateTalentDto extends PartialType(
  OmitType(CreateTalentDto, ["managerId"] as const),
) {}
