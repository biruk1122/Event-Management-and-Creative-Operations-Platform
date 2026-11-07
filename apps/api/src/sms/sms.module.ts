import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { AfroMessageProvider } from "./providers/afromessage.provider.js";
import { SmsAdminController } from "./sms-admin.controller.js";
import { SmsCallbackController } from "./sms-callback.controller.js";
import { StatusCheckRateLimiter } from "./sms-rate-limiter.js";
import { SmsRelayService } from "./sms-relay.service.js";
import { SmsRepository } from "./sms.repository.js";
import { SmsService } from "./sms.service.js";
import { SMS_PROVIDER, type SmsProvider } from "./sms.types.js";

/**
 * Centralized SMS. Business modules depend only on `SmsService.enqueue`; the
 * provider is chosen here, so another provider can be added without touching
 * any business module.
 */
@Module({
  imports: [AuditModule, AuthModule, PermissionsModule, OutboxModule],
  controllers: [SmsAdminController, SmsCallbackController],
  providers: [
    SmsRepository,
    SmsService,
    SmsRelayService,
    StatusCheckRateLimiter,
    {
      provide: SMS_PROVIDER,
      inject: [ENVIRONMENT],
      useFactory: (environment: Environment): SmsProvider =>
        new AfroMessageProvider({
          baseUrl: environment.AFROMESSAGE_BASE_URL,
          apiKey: environment.AFROMESSAGE_API_KEY,
          timeoutMs: environment.AFROMESSAGE_TIMEOUT_MS,
        }),
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
