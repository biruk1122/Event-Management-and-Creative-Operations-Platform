import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateUserDto {
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((dto: UpdateUserDto) => dto.roleId !== undefined)
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf(
    (dto: UpdateUserDto) =>
      dto.departmentId !== undefined && dto.departmentId !== null,
  )
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({
    format: "email",
    example: "regional.coordinator@example.com",
    maxLength: 320,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "Ada", minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: "Lovelace", minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: "+1 (555) 010-2030", maxLength: 32 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: "avatars/ada.png", maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  profileImage?: string;
}
