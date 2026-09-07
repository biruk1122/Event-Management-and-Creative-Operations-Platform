import type { Metadata } from "next";

import { listAssignableRoles, listUsers, UsersManager } from "@/features/users";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const [firstPage, roles] = await Promise.all([
    listUsers({ page: 1 }),
    listAssignableRoles(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-xl font-semibold tracking-tight text-balance">
        Users
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Create accounts, edit profiles, manage status, and assign roles.
      </p>

      <div className="mt-6">
        <UsersManager initialPage={firstPage} roles={roles} />
      </div>
    </main>
  );
}
