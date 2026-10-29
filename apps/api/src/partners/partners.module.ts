import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { PartnersController } from "./partners.controller.js";
import { PartnersSchedulerService } from "./partners-scheduler.service.js";
import { PartnersService } from "./partners.service.js";
import { PartnersRepository } from "./infrastructure/partners.repository.js";
import { PartnersSchedulerRepository } from "./infrastructure/partners-scheduler.repository.js";

@Module({
  imports: [AuthModule, OutboxModule, PermissionsModule],
  controllers: [PartnersController],
  providers: [
    PartnersService,
    PartnersRepository,
    PartnersSchedulerRepository,
    PartnersSchedulerService,
  ],
})
export class PartnersModule {}
