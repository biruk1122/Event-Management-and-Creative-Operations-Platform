import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class LeaveCalendarQueryDto {
  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  endDate!: string;
}
