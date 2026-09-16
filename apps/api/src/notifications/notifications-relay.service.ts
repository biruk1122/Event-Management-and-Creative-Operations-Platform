import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { OutboxRelayService } from "../outbox/outbox-relay.service.js";
import { NotificationsService } from "./notifications.service.js";

const CONSUMER_NAME = "notifications";
const CONSUMER_VERSION = 1;
/** ADR 0004 §6's fixed cadence: poll every 2s, claim up to 50 rows a batch. */
const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 50;

/**
 * The in-process outbox relay for the `notifications` consumer (ADR 0004
 * §6). This is the delivery mechanism the 5 immediate producer types need
 * regardless of scheduling - not the deferred business-logic scheduler that
 * would drive `TASK_DUE`/reminder-style types.
 */
@Injectable()
export class NotificationsRelayService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly outbox: OutboxRelayService,
    private readonly notifications: NotificationsService,
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
    if (this.polling) return; // A slow batch must finish before the next tick starts another.
    this.polling = true;
    try {
      const deliveries = await this.outbox.claimBatch(
        CONSUMER_NAME,
        CONSUMER_VERSION,
        BATCH_SIZE,
      );
      for (const delivery of deliveries) {
        try {
          await this.notifications.processEvent(delivery.event);
          await this.outbox.markSucceeded(delivery.deliveryId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `notifications consumer failed for event ${delivery.event.id} (${delivery.event.name}): ${message}`,
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
      this.logger.error(`outbox claim batch failed: ${message}`);
    } finally {
      this.polling = false;
    }
  }
}
