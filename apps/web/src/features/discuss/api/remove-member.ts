import type { RemoveMember } from "../lib/discuss-outcome";

/** Placeholder for `DELETE /api/v1/conversations/:id/members/:userId` - see
 * DSC-05. */
export const removeMember: RemoveMember = () =>
  Promise.resolve({ status: "unexpected" });
