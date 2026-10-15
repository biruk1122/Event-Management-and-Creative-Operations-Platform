import { ApiProperty } from "@nestjs/swagger";

import { ProductionLocationStatus } from "../generated/prisma/client.js";

export class ProductionLocationResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) productionId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactName!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ enum: ProductionLocationStatus }) status!:
    ProductionLocationStatus;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}

export class ProductionLocationsResponse {
  @ApiProperty({ type: [ProductionLocationResponse] })
  items!: ProductionLocationResponse[];
}
