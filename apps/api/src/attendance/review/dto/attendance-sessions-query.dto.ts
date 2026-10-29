import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class AttendanceSessionsQueryDto {
  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
