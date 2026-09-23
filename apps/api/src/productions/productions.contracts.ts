import { ApiProperty } from "@nestjs/swagger";
import { ProductionStatus } from "../generated/prisma/client.js";

class ProductionPerson {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
}
class ProductionTeam {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
class ProductionTalentPerson {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() type!: string;
}
class ProductionTalentAssignment {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ type: ProductionTalentPerson })
  talent!: ProductionTalentPerson;
}
export class ProductionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() productionType!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) startAt!:
    string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) endAt!:
    string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deadlineAt!: string | null;
  @ApiProperty({ enum: ProductionStatus }) status!: ProductionStatus;
  @ApiProperty({ type: ProductionPerson, nullable: true })
  manager!: ProductionPerson | null;
  @ApiProperty({ type: [ProductionTeam] }) teams!: ProductionTeam[];
  @ApiProperty({ type: [ProductionPerson] }) participants!: ProductionPerson[];
  @ApiProperty({ type: [ProductionTalentAssignment] })
  talents!: ProductionTalentAssignment[];
  @ApiProperty({ type: ProductionPerson, nullable: true })
  createdBy!: ProductionPerson | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class PaginatedProductionsResponse {
  @ApiProperty({ type: [ProductionResponse] }) items!: ProductionResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
