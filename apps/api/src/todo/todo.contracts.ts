import { ApiProperty } from "@nestjs/swagger";

export class TodoResponse {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    enum: ["PERSONAL", "WORK", "REMINDER", "QUICK_NOTE", "FOLLOW_UP"],
  })
  type!: string;
  @ApiProperty({ enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] })
  priority!: string;
  @ApiProperty({ enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] })
  status!: string;
  @ApiProperty({ type: String, format: "date", nullable: true })
  dueDate!: string | null;
  @ApiProperty({ type: String, nullable: true, example: "09:30:00" })
  dueTime!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  relatedEventId!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  relatedProjectId!: string | null;
  @ApiProperty({ type: Boolean }) reminderEnabled!: boolean;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reminderAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class TodoFeedResponse {
  @ApiProperty({ type: [TodoResponse] })
  items!: TodoResponse[];
}
