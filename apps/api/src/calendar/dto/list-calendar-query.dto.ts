import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsISO8601, IsOptional } from "class-validator";

const CALENDAR_TYPES = [
  "EVENT",
  "TASK",
  "PROJECT",
  "PERSONAL",
  "REMINDER",
] as const;

export class ListCalendarQueryDto {
  @ApiProperty({
    format: "date-time",
    description: "Inclusive UTC range start.",
  })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({
    format: "date-time",
    description: "Exclusive UTC range end; at most 90 days after from.",
  })
  @IsISO8601({ strict: true })
  to!: string;

  @ApiPropertyOptional({ enum: CALENDAR_TYPES })
  @IsOptional()
  @IsEnum(CALENDAR_TYPES)
  type?: (typeof CALENDAR_TYPES)[number];
}
