"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listAssignableDepartments,
  listAssignableTeams,
  listAssignableUsers,
} from "../../api/events-gateway";
import { eventKeys, useEventsMutations } from "../../api/events-queries";
import type { Event } from "../../lib/events-types";
import { EventDetailsPanel } from "./event-details-panel";
import { useEventWorkspace } from "./event-workspace-shell";

/** The Details tab. `?edit=1` shows the form, so Edit event can link to it. */
export function EventDetailsTab() {
  const { event, access, abilities } = useEventWorkspace();
  const keys = eventKeys(access);
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const editing = useSearchParams().get("edit") === "1";
  const mutations = useEventsMutations(access);

  const users = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canAssignManager,
  });
  const teams = useQuery({
    queryKey: keys.teams,
    queryFn: ({ signal }) => listAssignableTeams(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canAssignTeams,
  });
  const departments = useQuery({
    queryKey: keys.departments,
    queryFn: ({ signal }) => listAssignableDepartments(signal),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <EventDetailsPanel
      key={event.id}
      eventId={event.id}
      editing={editing}
      onEditingChange={(next) =>
        router.replace((next ? `${pathname}?edit=1` : pathname) as never, {
          scroll: false,
        })
      }
      users={users.data ?? []}
      teams={teams.data ?? []}
      departments={departments.data ?? []}
      canUpdate={abilities.canUpdate}
      canTransition={abilities.canTransition}
      canAssignManager={abilities.canAssignManager}
      canAssignTeams={abilities.canAssignTeams}
      canReadBudget={abilities.canReadBudget}
      canUpdateBudget={abilities.canUpdateBudget}
      canDelete={abilities.canDelete}
      canSeeLinkedCampaigns={abilities.canSeeLinkedCampaigns}
      canSeeLinkedProductions={abilities.canSeeLinkedProductions}
      onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
      onTransition={(id, status) =>
        mutations.transition.mutateAsync({ id, status })
      }
      onAssignManager={(id, managerId) =>
        mutations.assignManager.mutateAsync({ id, managerId })
      }
      onAssignTeam={(id, teamId) =>
        mutations.assignTeam.mutateAsync({ id, teamId })
      }
      onRemoveTeam={(id, teamId) =>
        mutations.removeTeam.mutateAsync({ id, teamId })
      }
      onSetBudget={(id, amount, currency) =>
        mutations.setBudget.mutateAsync({ id, amount, currency })
      }
      onDelete={mutations.remove.mutateAsync}
      onChanged={(next: Event) =>
        client.setQueryData(keys.detail(event.id), next)
      }
      onDeleted={() => router.push("/events")}
    />
  );
}
