import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

import { SupplierStatus } from "../../generated/prisma/client.js";
import { CreateSupplierDto } from "./create-supplier.dto.js";

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional({ enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;
}
