import { ApiProperty } from "@nestjs/swagger";

export class LeaveTypeResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  isPaid!: boolean;

  @ApiProperty()
  requiresDocumentation!: boolean;

  @ApiProperty()
  requiresApproval!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
