import type { Metadata } from "next";

import { listPermissions, listRoles, RolesManager } from "@/features/rbac";

export const metadata: Metadata = {
  title: "Roles and permissions",
};

export default async function RolesPage() {
  const [roles, permissions] = await Promise.all([
    listRoles(),
    listPermissions(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-xl font-semibold tracking-tight text-balance">
        Roles and permissions
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Create configurable roles and manage their permission grants.
      </p>

      <div className="mt-6">
        <RolesManager initialRoles={roles} permissions={permissions} />
      </div>
    </main>
  );
}
