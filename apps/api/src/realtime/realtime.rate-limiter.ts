import { Inject, Injectable } from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../config/environment.js";

/**
 * A per-connection command rate limit (ADR 0004 §7, RT-04): fixed-window
 * counter, in-memory only. The exact threshold is configured by
 * `REALTIME_COMMAND_RATE_LIMIT_MAX` / `_WINDOW_MS` (default 30 per 10s) and
 * is expected to be retuned with real traffic evidence, not the mechanism.
 */
@Injectable()
export class RealtimeRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.max = environment.REALTIME_COMMAND_RATE_LIMIT_MAX;
    this.windowMs = environment.REALTIME_COMMAND_RATE_LIMIT_WINDOW_MS;
  }

  /** Returns `true` when the command may proceed, `false` when the limit is hit. */
  consume(key: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (existing.count >= this.max) {
      return false;
    }

    existing.count += 1;
    return true;
  }

  /** For tests and connection cleanup: drop a key's window early. */
  reset(key: string): void {
    this.windows.delete(key);
  }
}
