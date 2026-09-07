import { FoundationOverview } from "@/features/foundation";
import { UsersNavigation } from "@/features/users";

import { RolesNavigation } from "@/features/rbac/components/roles-navigation";

export default function Home() {
  return (
    <>
      <RolesNavigation />
      <UsersNavigation />
      <FoundationOverview />
    </>
  );
}
