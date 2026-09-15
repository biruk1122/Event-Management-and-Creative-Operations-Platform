import type { UpdateReadCursor } from "../lib/discuss-outcome";

/** Placeholder for `PUT /api/v1/conversations/:id/read-cursor` - see DSC-05. */
export const updateReadCursor: UpdateReadCursor = () =>
  Promise.resolve({ status: "unexpected" });
