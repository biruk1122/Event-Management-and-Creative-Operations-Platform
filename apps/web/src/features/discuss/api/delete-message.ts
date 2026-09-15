import type { DeleteMessage } from "../lib/discuss-outcome";

/** Placeholder for `DELETE /api/v1/conversations/:id/messages/:messageId` -
 * see DSC-05. */
export const deleteMessage: DeleteMessage = () =>
  Promise.resolve({ status: "unexpected" });
