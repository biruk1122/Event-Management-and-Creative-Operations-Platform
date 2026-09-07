import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @ApiProperty({
    format: "email",
    example: "regional.coordinator@example.com",
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: "Ada", minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: "Lovelace", minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

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

  @ApiProperty({
    example: "a temporary secret the user rotates on first sign-in",
    minLength: 8,
    maxLength: 256,
    description:
      "Initial password set on the user's behalf; the account is flagged to require a change.",
  })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  temporaryPassword!: string;

  @ApiPropertyOptional({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description: "Assign this role on creation. Omit for baseline-only access.",
  })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
