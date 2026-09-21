import type { AssignableEvent } from "../lib/campaigns-types";
import { FIXTURE_EVENTS } from "./fixtures";

export type ListAssignableEvents = () => Promise<AssignableEvent[]>;

/**
 * Placeholder for the events the "related event" control can offer. The
 * campaigns API has no dedicated route, so CAM-05 reads the first page of
 * `GET /api/v1/events`. Until then it returns a fixture set.
 */
export const listAssignableEvents: ListAssignableEvents = () =>
  Promise.resolve([...FIXTURE_EVENTS]);
