import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxRelayService } from "../outbox/outbox-relay.service.js";
import { SmsService } from "./sms.service.js";
import { SMS_CONSUMER_NAME, SMS_CONSUMER_VERSION } from "./sms.types.js";

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 25;
/** Stuck-SENDING recovery runs every 15 polls, about every 30 seconds. */
const RECOVERY_EVERY_POLLS = 15;

/**
 * Polls the outbox for the `sms` consumer, the same way the notifications
 * relay does. A failure here is retried by the outbox. A send that times out
 * is recorded as UNCERTAIN and returns normally, so it is not retried.
 */
@Injectable()
export class SmsRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private polls = 0;

  constructor(
    private readonly outbox: OutboxRelayService,
    private readonly sms: SmsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    this.polls += 1;
    if (this.polls % RECOVERY_EVERY_POLLS === 0) {
      try {
        await this.sms.recoverStuckSending();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`sms stuck-send recovery failed: ${message}`);
      }
    }
    try {
      const deliveries = await this.outbox.claimBatch(
        SMS_CONSUMER_NAME,
        SMS_CONSUMER_VERSION,
        BATCH_SIZE,
      );
      for (const delivery of deliveries) {
        try {
          await this.sms.dispatch(delivery.event);
          await this.outbox.markSucceeded(delivery.deliveryId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `sms consumer failed for event ${delivery.event.id}: ${message}`,
          );
          await this.outbox.markFailed(
            delivery.deliveryId,
            delivery.attempts,
            message,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`sms outbox claim failed: ${message}`);
    } finally {
      this.polling = false;
    }
  }
}
