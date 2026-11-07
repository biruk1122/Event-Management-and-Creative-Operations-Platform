import { ApiProperty } from "@nestjs/swagger";

/** One SMS in the administrator history. The phone number is masked. */
export class SmsMessageResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "TEST" })
  category!: string;

  @ApiProperty({ example: "ACCEPTED" })
  status!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  recipientUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Dana Okafor" })
  recipientName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "+251******123" })
  recipientPhoneMasked!: string | null;

  @ApiProperty({ example: "test.connection" })
  templateKey!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: String, nullable: true })
  skipReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  providerMessageId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  providerStatus!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  providerStatusCheckedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  callbackStatus!: string | null;

  @ApiProperty()
  attempts!: number;

  @ApiProperty({ type: String, nullable: true })
  lastError!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  acceptedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class PaginatedSmsMessagesResponse {
  @ApiProperty({ type: () => [SmsMessageResponse] })
  items!: SmsMessageResponse[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class SmsServiceStatusResponse {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({
    description:
      "Whether the provider key is set. The key itself is never returned.",
  })
  apiKeyConfigured!: boolean;

  @ApiProperty()
  senderConfigured!: boolean;

  @ApiProperty()
  callbackConfigured!: boolean;

  @ApiProperty()
  timeoutMs!: number;
}

export class SmsConnectionTestResponse {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ type: String, required: false })
  reason?: string;

  @ApiProperty({ type: String, required: false })
  balance?: string;

  @ApiProperty({ type: String, required: false })
  estimatedMessages?: string;
}
