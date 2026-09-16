import { Module } from "@nestjs/common";

import { OutboxRelayService } from "./outbox-relay.service.js";
import { OutboxWriterService } from "./outbox-writer.service.js";
import { OutboxRepository } from "./infrastructure/outbox.repository.js";

@Module({
  providers: [OutboxRepository, OutboxWriterService, OutboxRelayService],
  exports: [OutboxWriterService, OutboxRelayService],
})
export class OutboxModule {}
