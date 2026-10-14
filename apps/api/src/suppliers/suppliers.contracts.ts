import { ApiProperty } from "@nestjs/swagger";

import { SupplierStatus } from "../generated/prisma/client.js";

/**
 * A supplier/vendor directory entry (EOM-01). `departmentId = null` means a
 * shared, organization-wide entry visible to every department; a set
 * `departmentId` means a department-private entry.
 */
export class SupplierResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Grand Hall Catering Co." })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: "Catering" })
  category!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactName!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "email" })
  contactEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Null for a shared, organization-wide supplier.",
  })
  departmentId!: string | null;

  @ApiProperty({ enum: SupplierStatus })
  status!: SupplierStatus;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedSuppliersResponse {
  @ApiProperty({ type: [SupplierResponse] })
  items!: SupplierResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}
