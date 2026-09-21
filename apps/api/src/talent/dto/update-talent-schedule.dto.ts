import { PartialType } from "@nestjs/swagger";

import { CreateTalentScheduleDto } from "./create-talent-schedule.dto.js";

export class UpdateTalentScheduleDto extends PartialType(
  CreateTalentScheduleDto,
) {}
