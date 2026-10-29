import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { EmploymentStatus } from "../../generated/prisma/client.js";

/**
 * Changes employment status, with confirmation handled client-side (the
 * spec requires a confirmation step before this call is made, not a second
 * server-side confirmation token).
 */
export class UpdateEmployeeStatusDto {
  @ApiProperty({ enum: EmploymentStatus })
  @IsEnum(EmploymentStatus)
  status!: EmploymentStatus;
}
