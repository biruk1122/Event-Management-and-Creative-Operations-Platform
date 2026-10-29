import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

import { AttendanceOvertimeStatus } from "../../../generated/prisma/client.js";

export class ListOvertimeQueryDto {
  @ApiPropertyOptional({ enum: AttendanceOvertimeStatus })
  @IsOptional()
  @IsEnum(AttendanceOvertimeStatus)
  status?: AttendanceOvertimeStatus;
}
