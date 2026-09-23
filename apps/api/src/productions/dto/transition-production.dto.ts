import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { ProductionStatus } from "../../generated/prisma/client.js";
export class TransitionProductionDto {
  @ApiProperty({ enum: ProductionStatus })
  @IsEnum(ProductionStatus)
  status!: ProductionStatus;
}
