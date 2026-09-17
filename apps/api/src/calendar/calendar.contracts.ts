import { ApiProperty } from "@nestjs/swagger";

export class CalendarEntryResponse {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ["EVENT", "TASK", "PROJECT", "PERSONAL", "REMINDER"] })
  type!: string;
  @ApiProperty({ type: String, format: "date-time" }) startAt!: string;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endAt!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  eventId!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  taskId!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  projectId!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class CalendarFeedResponse {
  @ApiProperty({ type: [CalendarEntryResponse] })
  items!: CalendarEntryResponse[];
}
