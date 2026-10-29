import { ApiProperty } from "@nestjs/swagger";

import {
  AttendanceVerificationResult,
  EventShiftStatus,
} from "../../generated/prisma/client.js";
import { AttendanceSessionResponse } from "../attendance.contracts.js";

export class MyShiftResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

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

  @ApiProperty({ enum: EventShiftStatus })
  status!: EventShiftStatus;
}

export class MobilePunchResponse {
  @ApiProperty({ type: AttendanceSessionResponse })
  session!: AttendanceSessionResponse;

  @ApiProperty({ enum: AttendanceVerificationResult })
  verificationResult!: AttendanceVerificationResult;

  @ApiProperty()
  message!: string;
}
