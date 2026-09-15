import type { UpdateChannel } from "../lib/discuss-outcome";

/** Placeholder for `PATCH /api/v1/conversations/:id` - see DSC-05. */
export const updateChannel: UpdateChannel = () =>
  Promise.resolve({ status: "unexpected" });
