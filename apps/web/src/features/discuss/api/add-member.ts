import type { AddMember } from "../lib/discuss-outcome";

/** Placeholder for `PUT /api/v1/conversations/:id/members/:userId` - see
 * DSC-05. */
export const addMember: AddMember = () =>
  Promise.resolve({ status: "unexpected" });
