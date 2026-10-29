import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

import { LeaveRequestStatus } from "../../generated/prisma/client.js";

export class ListLeaveRequestsQueryDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Restrict to one employee - only meaningful with department/organization visibility.",
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
