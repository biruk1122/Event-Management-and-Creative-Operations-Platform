import { ApiProperty } from "@nestjs/swagger";

export class LivenessResponse {
  @ApiProperty({ enum: ["ok"], example: "ok" })
  status!: "ok";

  @ApiProperty({ example: "2026-09-01T09:00:00.000Z", format: "date-time" })
  timestamp!: string;
}

export class ReadinessChecks {
  @ApiProperty({ enum: ["up"], example: "up" })
  database!: "up";
}

export class ReadinessResponse {
  @ApiProperty({ type: ReadinessChecks })
  checks!: ReadinessChecks;

  @ApiProperty({ enum: ["ready"], example: "ready" })
  status!: "ready";

  @ApiProperty({ example: "2026-09-01T09:00:00.000Z", format: "date-time" })
  timestamp!: string;
}
