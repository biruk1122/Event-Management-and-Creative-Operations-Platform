import {
  FIXTURE_DEPARTMENTS,
  FIXTURE_TEAMS,
  FIXTURE_WORKSPACES,
} from "./fixtures";

export interface ChannelOwnerOptions {
  workspaces: readonly { id: string; name: string }[];
  departments: readonly { id: string; name: string }[];
  teams: readonly { id: string; name: string }[];
}

export type ListChannelOwners = () => Promise<ChannelOwnerOptions>;

/**
 * Placeholder for the workspace/department/team lists the channel-owner
 * picker offers. DSC-05 (EVE-109) replaces the body with real
 * `GET /api/v1/workspaces`, `GET /api/v1/departments`, and
 * `GET /api/v1/teams` calls.
 */
export const listChannelOwners: ListChannelOwners = () =>
  Promise.resolve({
    workspaces: [...FIXTURE_WORKSPACES],
    departments: [...FIXTURE_DEPARTMENTS],
    teams: [...FIXTURE_TEAMS],
  });
