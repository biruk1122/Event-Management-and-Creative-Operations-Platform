import { FoundationOverview } from "@/features/foundation";

import { RolesNavigation } from "@/features/rbac/components/roles-navigation";

export default function Home() {
  return (
    <>
      <RolesNavigation />
      <FoundationOverview />
    </>
  );
}
