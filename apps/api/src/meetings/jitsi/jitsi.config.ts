import { Inject, Injectable } from "@nestjs/common";
import { ENVIRONMENT, type Environment } from "../../config/environment.js";

export interface JitsiJwtConfig {
  appId: string;
  appSecret: string;
}

@Injectable()
export class JitsiConfig {
  readonly enabled: boolean;
  readonly domain: string;
  readonly jwt: JitsiJwtConfig | null;

  constructor(@Inject(ENVIRONMENT) env: Environment) {
    this.enabled = env.JITSI_ENABLED;
    this.domain = env.JITSI_DOMAIN.trim();
    if (this.enabled && !this.domain) {
      throw new Error("JITSI_DOMAIN is required when JITSI_ENABLED is true");
    }
    if (env.JITSI_JWT_ENABLED) {
      const appId = env.JITSI_APP_ID.trim();
      const appSecret = env.JITSI_APP_SECRET.trim();
      if (!appId || !appSecret) {
        throw new Error(
          "JITSI_APP_ID and JITSI_APP_SECRET are required when JITSI_JWT_ENABLED is true",
        );
      }
      this.jwt = { appId, appSecret };
    } else {
      this.jwt = null;
    }
  }
}
