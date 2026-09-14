import type { RealtimeConnectionState } from "./realtime-types";

/**
 * Canned connection states for every status this feature renders. RTC-05
 * (EVE-103) wires `connectRealtime` to a real `socket.io-client` handshake
 * against `/realtime`; until then these stand in for what that handshake can
 * report (ADR 0004 §1 and §4).
 */
export const REALTIME_FIXTURES = {
  disabled: {
    status: "disabled",
    detail: null,
    rooms: [],
  },
  connectedEmpty: {
    status: "connected",
    detail: null,
    rooms: [],
  },
  connectedWithRooms: {
    status: "connected",
    detail: null,
    rooms: [
      {
        room: "workspace:6f6a2d0e-2c3a-4f7a-9d1c-1a2b3c4d5e6f",
        label: "Autumn Gala workspace",
      },
      {
        room: "user:9c8b7a6f-5e4d-3c2b-1a09-8f7e6d5c4b3a",
        label: "Your notifications",
      },
    ],
  },
  reconnecting: {
    status: "reconnecting",
    detail: null,
    rooms: [
      {
        room: "workspace:6f6a2d0e-2c3a-4f7a-9d1c-1a2b3c4d5e6f",
        label: "Autumn Gala workspace",
      },
    ],
  },
  denied: {
    status: "denied",
    detail: "Your account cannot access live updates for this area.",
    rooms: [],
  },
  error: {
    status: "error",
    detail: "We could not reach the live updates service.",
    rooms: [],
  },
} satisfies Record<string, RealtimeConnectionState>;
