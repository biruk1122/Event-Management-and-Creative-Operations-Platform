import { FoundationOverview } from "@/features/foundation";
import { DepartmentsNavigation } from "@/features/departments";
import { TeamsNavigation } from "@/features/teams";
import { UsersNavigation } from "@/features/users";

import { RolesNavigation } from "@/features/rbac/components/roles-navigation";

export default function Home() {
  return (
    <>
      <RolesNavigation />
      <UsersNavigation />
      <DepartmentsNavigation />
      <TeamsNavigation />
      <FoundationOverview />
    </>
  );
}
