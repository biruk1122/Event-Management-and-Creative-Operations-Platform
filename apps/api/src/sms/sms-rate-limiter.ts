/**
 * Keeps status checks inside the provider's documented limit: at most one
 * request every other second and 30 a minute. After the provider reports a
 * rate-limit response, calls are blocked for two minutes.
 */
export class StatusCheckRateLimiter {
  private readonly windowMs = 60_000;
  private readonly maxPerWindow = 30;
  private readonly minIntervalMs = 2_000;
  private readonly blockMs = 120_000;
  private readonly timestamps: number[] = [];
  private blockedUntil = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Returns true and records the call when it is allowed. */
  tryAcquire(): boolean {
    const current = this.now();
    if (current < this.blockedUntil) return false;
    while (
      this.timestamps.length > 0 &&
      current - this.timestamps[0]! >= this.windowMs
    ) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxPerWindow) return false;
    const last = this.timestamps.at(-1);
    if (last !== undefined && current - last < this.minIntervalMs) return false;
    this.timestamps.push(current);
    return true;
  }

  /** Called when the provider answers with a rate-limit response. */
  block(): void {
    this.blockedUntil = this.now() + this.blockMs;
  }
}
