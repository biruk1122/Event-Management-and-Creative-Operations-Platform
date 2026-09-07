import type { RoleWithGrants } from "../lib/rbac-types";
export { getRole } from "./rbac-gateway";
export type GetRole = (id: string) => Promise<RoleWithGrants | null>;
