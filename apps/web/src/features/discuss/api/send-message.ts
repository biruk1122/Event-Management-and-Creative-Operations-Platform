import type { SendMessage } from "../lib/discuss-outcome";

/** Placeholder for `POST /api/v1/conversations/:id/messages` - see DSC-05. */
export const sendMessage: SendMessage = () =>
  Promise.resolve({ status: "unexpected" });
