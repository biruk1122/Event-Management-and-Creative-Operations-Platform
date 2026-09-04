import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ format: "email", example: "manager@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: "correct horse battery staple", minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}
