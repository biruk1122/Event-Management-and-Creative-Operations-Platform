import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
} from "class-validator";

export class CheckMeetingAvailabilityDto {
  @ApiProperty({ type: [String], format: "uuid", maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  userIds!: string[];

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  endAt!: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Meeting excluded when checking a reschedule.",
  })
  @IsOptional()
  @IsUUID()
  excludeMeetingId?: string;
}
