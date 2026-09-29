import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength } from "class-validator";

export class MarketingStrategyDto {
  @ApiProperty({
    example: "Reach local audiences through partner-led campaigns.",
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  @Matches(/\S/, { message: "strategy must not be blank" })
  strategy!: string;
}
