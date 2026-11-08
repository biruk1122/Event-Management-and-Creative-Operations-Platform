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

/** The only provider fields returned. Free text is withheld; see sms-redaction.ts. */
export class SmsProviderAcknowledgementResponse {
  @ApiProperty({ type: String, nullable: true, example: "success" })
  acknowledge!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Send in progress" })
  status!: string | null;
}

export class SmsRecipientResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Hanna Bekele" })
  name!: string;
}

export class SmsRecipientListResponse {
  @ApiProperty({ type: () => [SmsRecipientResponse] })
  items!: SmsRecipientResponse[];
}

export class SmsDeliveryAttemptResponse {
  @ApiProperty()
  attemptNumber!: number;

  @ApiProperty({ example: "REJECTED" })
  outcome!: string;

  @ApiProperty({ type: Number, nullable: true })
  providerHttpStatus!: number | null;

  @ApiProperty({
    type: () => SmsProviderAcknowledgementResponse,
    nullable: true,
    description:
      "Provider acknowledgement and status tokens only. Free text is withheld.",
  })
  providerResponse!: SmsProviderAcknowledgementResponse | null;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty({ format: "date-time" })
  startedAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
}

export class SmsMessageDetailResponse extends SmsMessageResponse {
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  callbackReceivedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  sourceDueAt!: string | null;

  @ApiProperty({ type: () => [SmsDeliveryAttemptResponse] })
  deliveryAttempts!: SmsDeliveryAttemptResponse[];
}

export class SmsSettingsCategoryResponse {
  @ApiProperty({ example: "TASK_ASSIGNED" })
  category!: string;

  @ApiProperty()
  enabled!: boolean;
}

export class SmsSettingsResponse {
  @ApiProperty({
    description:
      "The environment switch (AFROMESSAGE_ENABLED). It always overrides runtime settings.",
  })
  environmentEnabled!: boolean;

  @ApiProperty({ description: "The runtime global switch. Starts disabled." })
  globalEnabled!: boolean;

  @ApiProperty({
    description:
      "True only when the environment and runtime switches are both on.",
  })
  effectiveEnabled!: boolean;

  @ApiProperty({ type: () => [SmsSettingsCategoryResponse] })
  categories!: SmsSettingsCategoryResponse[];

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ type: () => SmsServiceStatusResponse })
  provider!: SmsServiceStatusResponse;
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
