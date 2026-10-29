import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

import { AttendanceExceptionStatus } from "../../../generated/prisma/client.js";

export class ListExceptionsQueryDto {
  @ApiPropertyOptional({ enum: AttendanceExceptionStatus })
  @IsOptional()
  @IsEnum(AttendanceExceptionStatus)
  status?: AttendanceExceptionStatus;
}
