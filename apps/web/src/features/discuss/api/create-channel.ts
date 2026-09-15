import type { CreateChannel } from "../lib/discuss-outcome";

/** Placeholder for `POST /api/v1/conversations/channels` - see DSC-05. */
export const createChannel: CreateChannel = () =>
  Promise.resolve({ status: "unexpected" });
