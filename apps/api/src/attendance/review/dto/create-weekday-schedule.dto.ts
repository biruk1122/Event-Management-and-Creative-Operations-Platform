import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsInt, Max, Min } from "class-validator";

import { AttendanceDayType } from "../../../generated/prisma/client.js";

/** Changing a weekday's type INSERTS a new effective-dated row - there is
 * no PATCH/update here on purpose, see `AttendanceWeekdaySchedule`'s own
 * schema comment for why. */
export class CreateWeekdayScheduleDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: "0 = Sunday .. 6 = Saturday.",
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ enum: AttendanceDayType })
  @IsEnum(AttendanceDayType)
  type!: AttendanceDayType;

  @ApiProperty({
    type: String,
    format: "date",
    description:
      "The date this type takes effect from (inclusive). A past date corrects a mistake; a future date schedules an upcoming change.",
  })
  @IsDateString({ strict: true })
  effectiveFrom!: string;
}
