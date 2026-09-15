import { FoundationOverview } from "@/features/foundation";
import { DepartmentsNavigation } from "@/features/departments";
import { DiscussNavigation } from "@/features/discuss";
import { EventsNavigation } from "@/features/events";
import { ProjectsNavigation } from "@/features/projects";
import { TeamsNavigation } from "@/features/teams";
import { UsersNavigation } from "@/features/users";
import { WorkspacesNavigation } from "@/features/workspaces";

import { RolesNavigation } from "@/features/rbac/components/roles-navigation";

export default function Home() {
  return (
    <>
      <RolesNavigation />
      <UsersNavigation />
      <DepartmentsNavigation />
      <TeamsNavigation />
      <WorkspacesNavigation />
      <EventsNavigation />
      <ProjectsNavigation />
      <DiscussNavigation />
      <FoundationOverview />
    </>
  );
}
