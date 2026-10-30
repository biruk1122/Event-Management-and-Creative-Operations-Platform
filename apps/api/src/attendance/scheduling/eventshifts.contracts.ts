import { ApiProperty } from "@nestjs/swagger";

import {
  EventShiftChangeType,
  EventShiftStatus,
} from "../../generated/prisma/client.js";

export class EventShiftResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  eventId!: string;

  @ApiProperty()
  eventName!: string;

  @ApiProperty({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ format: "date-time" })
  plannedStartAt!: string;

  @ApiProperty({ format: "date-time" })
  plannedEndAt!: string;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ type: String, nullable: true })
  locationLabel!: string | null;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  geofenceRadiusMeters!: number;

  @ApiProperty()
  breakMinutes!: number;

  @ApiProperty({ enum: EventShiftStatus })
  status!: EventShiftStatus;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class EventShiftChangeResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: EventShiftChangeType })
  changeType!: EventShiftChangeType;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  previousStartAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  previousEndAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  newStartAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  newEndAt!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: String, nullable: true })
  changedByName!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class EventShiftAssignmentResponse {
  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty({ format: "date-time" })
  assignedAt!: string;
}
