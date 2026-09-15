import type { EditMessage } from "../lib/discuss-outcome";

/** Placeholder for `PATCH /api/v1/conversations/:id/messages/:messageId` -
 * see DSC-05. */
export const editMessage: EditMessage = () =>
  Promise.resolve({ status: "unexpected" });
