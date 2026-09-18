import { FoundationOverview } from "@/features/foundation";
import { CalendarNavigation } from "@/features/calendar";
import { DepartmentsNavigation } from "@/features/departments";
import { DiscussNavigation } from "@/features/discuss";
import { EventsNavigation } from "@/features/events";
import { ProjectsNavigation } from "@/features/projects";
import { TasksNavigation } from "@/features/tasks";
import { TeamsNavigation } from "@/features/teams";
import { UsersNavigation } from "@/features/users";
import { WorkspacesNavigation } from "@/features/workspaces";
import { NotificationsNavigation } from "@/features/notifications";
import { TodoNavigation } from "@/features/todo";
import { MeetingsNavigation } from "@/features/meetings";

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
      <TasksNavigation />
      <DiscussNavigation />
      <NotificationsNavigation />
      <CalendarNavigation />
      <TodoNavigation />
      <MeetingsNavigation />
      <FoundationOverview />
    </>
  );
}
