import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from "class-validator";

import { SMS_CATEGORIES, SMS_STATUSES } from "./sms.types.js";

export class ListSmsMessagesQueryDto {
  @ApiPropertyOptional({ enum: SMS_STATUSES })
  @IsOptional()
  @IsIn(SMS_STATUSES)
  status?: (typeof SMS_STATUSES)[number];

  @ApiPropertyOptional({ enum: SMS_CATEGORIES })
  @IsOptional()
  @IsIn(SMS_CATEGORIES)
  category?: (typeof SMS_CATEGORIES)[number];

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class ResolveSmsMessageDto {
  @ApiProperty({
    enum: ["CANCEL", "REQUEUE"],
    description:
      "CANCEL closes an uncertain send without sending. REQUEUE sends it again; only use it when the message was not delivered.",
  })
  @IsIn(["CANCEL", "REQUEUE"])
  decision!: "CANCEL" | "REQUEUE";
}

/** Callback query from the provider. Both parameters are required. */
export class SmsCallbackQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  message_id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  status!: string;
}
