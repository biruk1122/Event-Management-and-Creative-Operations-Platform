"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  getProduction,
  listProductionPeople,
  listProductionTalents,
  listProductionTeams,
  listProductions,
} from "../api/productions-gateway";
import {
  productionKeys,
  useProductionMutations,
} from "../api/productions-queries";
import { productionAbilities, productionAreas } from "../lib/production-access";
import { ProductionRequestError } from "../lib/production-errors";
import type { ProductionStatus } from "../lib/production-types";
import { ProductionsBoard } from "./productions-board";

const PAGE_SIZE = 10;

export function ProductionsManager({ access }: { access: CurrentAccess }) {
  const client = useQueryClient();
  const keys = productionKeys(access);
  const abilities = productionAbilities(access);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ProductionStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = {
    status: status === "ALL" ? null : status,
    search: debouncedSearch || null,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => listProductions(params, signal),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const detail = useQuery({
    queryKey: keys.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getProduction(selectedId!, signal),
    enabled: selectedId !== null,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const people = useQuery({
    queryKey: keys.people,
    queryFn: ({ signal }) => listProductionPeople(signal),
    enabled: abilities.canAssign && abilities.canListPeople,
    retry: false,
    staleTime: 60_000,
  });
  const teams = useQuery({
    queryKey: keys.teams,
    queryFn: ({ signal }) => listProductionTeams(signal),
    enabled: abilities.canAssign && abilities.canListTeams,
    retry: false,
    staleTime: 60_000,
  });
  const talents = useQuery({
    queryKey: keys.talents,
    queryFn: ({ signal }) => listProductionTalents(signal),
    enabled: abilities.canAssign && abilities.canListTalent,
    retry: false,
    staleTime: 60_000,
  });
  const mutations = useProductionMutations(access);

  useEffect(() => {
    if (
      [list.error, detail.error, people.error, teams.error, talents.error].some(
        (error) =>
          error instanceof ProductionRequestError &&
          (error.status === 401 || error.status === 403),
      )
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [
    list.error,
    detail.error,
    people.error,
    teams.error,
    talents.error,
    client,
  ]);

  const data = list.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  return (
    <ProductionsBoard
      productions={data?.items ?? []}
      state={list.isPending ? "loading" : list.isError ? "error" : "ready"}
      onRetry={() => void list.refetch()}
      refreshing={list.isFetching && !list.isPending}
      total={data?.total ?? 0}
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      searchValue={search}
      statusValue={status}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      onStatusChange={(value) => {
        setStatus(value);
        setPage(1);
      }}
      onClearFilters={() => {
        setSearch("");
        setStatus("ALL");
        setPage(1);
      }}
      onSelect={setSelectedId}
      onCloseDetails={() => setSelectedId(null)}
      selectedProduction={detail.data}
      detailLoading={selectedId !== null && detail.isPending}
      detailError={detail.error instanceof Error ? detail.error.message : null}
      onDetailRetry={() => void detail.refetch()}
      areas={productionAreas(access)}
      canCreate={abilities.canCreate}
      canUpdate={abilities.canUpdate}
      canTransition={abilities.canTransition}
      canAssign={abilities.canAssign}
      canDelete={abilities.canDelete}
      availablePeople={people.data ?? []}
      peopleUnavailable={
        abilities.canAssign && (!abilities.canListPeople || people.isError)
      }
      availableTeams={teams.data ?? []}
      teamsUnavailable={
        abilities.canAssign && (!abilities.canListTeams || teams.isError)
      }
      availableTalents={talents.data ?? []}
      talentsUnavailable={
        abilities.canAssign && (!abilities.canListTalent || talents.isError)
      }
      onCreate={(values) =>
        mutations.create.mutateAsync(values).then(() => undefined)
      }
      onUpdate={(id, values) =>
        mutations.update.mutateAsync({ id, values }).then(() => undefined)
      }
      onTransition={(id, next) =>
        mutations.transition
          .mutateAsync({ id, status: next })
          .then(() => undefined)
      }
      onAssignManager={(id, managerId) =>
        mutations.manager.mutateAsync({ id, managerId }).then(() => undefined)
      }
      onAssignTeam={(id, teamId) =>
        mutations.assignTeam.mutateAsync({ id, teamId }).then(() => undefined)
      }
      onRemoveTeam={(id, teamId) =>
        mutations.removeTeam.mutateAsync({ id, teamId }).then(() => undefined)
      }
      onAddMember={(id, userId) =>
        mutations.addMember.mutateAsync({ id, userId }).then(() => undefined)
      }
      onRemoveMember={(id, userId) =>
        mutations.removeMember.mutateAsync({ id, userId }).then(() => undefined)
      }
      onAssignTalent={(id, talentId, role) =>
        mutations.assignTalent
          .mutateAsync({ id, talentId, role })
          .then(() => undefined)
      }
      onRemoveTalent={(id, talentId) =>
        mutations.removeTalent
          .mutateAsync({ id, talentId })
          .then(() => undefined)
      }
      onDelete={mutations.remove.mutateAsync}
    />
  );
}
