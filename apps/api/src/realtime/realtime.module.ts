import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { SessionRegistryService } from "./infrastructure/session-registry.service.js";
import { RealtimeGateway } from "./realtime.gateway.js";
import { RealtimeRateLimiter } from "./realtime.rate-limiter.js";
import { RealtimeService } from "./realtime.service.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  providers: [
    RealtimeGateway,
    RealtimeService,
    RealtimeRateLimiter,
    SessionRegistryService,
  ],
  // A future producer module (workspace live updates, notifications, direct
  // messages) injects `RealtimeService` to call `publish()`, and may inject
  // `SessionRegistryService` to disconnect a revoked session's sockets.
  exports: [RealtimeService, SessionRegistryService],
})
export class RealtimeModule {}
