import { REALTIME_FIXTURES } from "../lib/realtime-fixtures";
import type { ConnectRealtime } from "../lib/realtime-types";

/**
 * Fixture-backed stand-in for the real `/realtime` Socket.IO handshake
 * (ADR 0004 §1). RTC-05 (EVE-103) replaces this with a `socket.io-client`
 * connection to the gateway; `RealtimeStatusPanel` only depends on this
 * function's shape, so that swap does not touch component code.
 */
export const connectRealtime: ConnectRealtime = () =>
  Promise.resolve(REALTIME_FIXTURES.connectedEmpty);
