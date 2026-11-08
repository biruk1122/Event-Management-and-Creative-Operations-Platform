import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  MinLength,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({
    format: "uuid",
    description: "Only messages for this recipient user.",
  })
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Created at or after this instant.",
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Created at or before this instant.",
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

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

export class SearchSmsRecipientsQueryDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    description: "A name fragment, or a full user ID.",
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

export class UpdateSmsSettingsDto {
  @ApiPropertyOptional({
    description: "Global SMS switch. The environment switch still applies.",
  })
  @IsOptional()
  @IsBoolean()
  globalEnabled?: boolean;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: { type: "boolean" },
    description: "Per-category switches, keyed by category name.",
  })
  @IsOptional()
  @IsObject()
  categories?: Record<string, boolean>;
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
