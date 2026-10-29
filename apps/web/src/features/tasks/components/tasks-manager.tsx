"use client";

import { useCallback, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "../api/tasks-gateway";
import { TasksRequestError } from "../api/tasks-gateway";
import { taskKeys, useTaskMutations } from "../api/tasks-queries";
import {
  canCreateTasks,
  canCreateTasksForAnyDepartment,
} from "../lib/task-access";
import type { Task, TaskStatus } from "../lib/tasks-types";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskWorkspace } from "./tasks-workspace";

const PAGE_SIZE = 25;

function hasGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some((grant) => grant.permissionKey === permissionKey);
}

/** True for a grant held at any scope other than SELF (ORGANIZATION or
 * DEPARTMENT today) - those scopes authorize acting on any task in reach
 * regardless of assignment. SELF scope, in contrast, means "I am this
 * task's assignee" (see [[task-management-redesign]]'s assignee-only
 * self-report fix) and must be checked per task. */
function hasBroadGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some(
    (grant) => grant.permissionKey === permissionKey && grant.scope !== "SELF",
  );
}

function hasSelfGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some(
    (grant) => grant.permissionKey === permissionKey && grant.scope === "SELF",
  );
}

/** True only for an organization-scoped grant (Super Admin) - the mirror
 * of the backend's `actorIsOrganizationScoped` check, used for the
 * legacy-checklist-item fallback (an item with no recorded creator is
 * only manageable by an organization-scoped actor, never a
 * department-scoped Manager by default). */
function hasOrganizationGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some(
    (grant) =>
      grant.permissionKey === permissionKey && grant.scope === "ORGANIZATION",
  );
}

function isAssignee(task: Task, userId: string): boolean {
  return task.assignees.some((assignee) => assignee.id === userId);
}

function isCreator(task: Task, userId: string): boolean {
  return task.createdBy?.id === userId;
}

/** Builds a per-task "may act on this task, but only as its own creator"
 * predicate for a given permission key: an organization-scoped actor
 * (Super Admin) always can; a narrower-scoped actor (Department Manager)
 * only when they are this task's own creator - a Manager who is merely
 * the assignee of a task someone else created (typically Super Admin)
 * never qualifies, regardless of holding the permission at DEPARTMENT
 * scope. Shared by assignee management, checklist add/remove, and review
 * decisions - all three are creator-only actions for a non-organization
 * -scoped actor. */
function creatorGatedFor(access: CurrentAccess, permissionKey: string) {
  const organizationScoped = hasOrganizationGrant(access, permissionKey);
  const grantedAtAll = hasGrant(access, permissionKey);
  return (task: Task) =>
    organizationScoped || (grantedAtAll && isCreator(task, access.userId));
}

/** Per-task "may manage this task's own assignee list" predicate - a
 * Manager who is merely the assignee of a task someone else created
 * manages assignment only by creating subtasks, not by editing who else
 * works on a task assigned to them. */
function canManageAssigneesFor(access: CurrentAccess) {
  return creatorGatedFor(access, "task.assign");
}

/** Builds a per-task predicate for an assignee-only self-report action:
 * true if the actor holds the grant broadly (org/department), or holds it
 * at SELF scope and is specifically this task's assignee - never merely
 * its creator. */
function canActOnAssignedTask(access: CurrentAccess, permissionKey: string) {
  const broad = hasBroadGrant(access, permissionKey);
  const self = hasSelfGrant(access, permissionKey);
  return (task: Task) => broad || (self && isAssignee(task, access.userId));
}

export interface TaskListFilters {
  search: string;
  status: TaskStatus | null;
  assignedToMe: boolean;
  createdByMe: boolean;
  overdueOnly: boolean;
  departmentId: string | null;
}

/** Owns API state so the workspace stays a rendering and interaction surface. */
export function TasksManager({ access }: { access: CurrentAccess }) {
  const [filters, setFilters] = useState<TaskListFilters>({
    search: "",
    status: null,
    assignedToMe: false,
    createdByMe: false,
    overdueOnly: false,
    departmentId: null,
  });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const client = useQueryClient();
  const keys = taskKeys(access);
  const canCreate = canCreateTasks(access);
  const listParams = {
    search: filters.search,
    status: filters.status,
    ...(filters.assignedToMe ? { assigneeId: access.userId } : {}),
    ...(filters.createdByMe ? { createdById: access.userId } : {}),
    ...(filters.overdueOnly ? { overdue: true } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => gateway.listTasks(listParams, signal),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const users = useQuery({
    queryKey: keys.assignees,
    queryFn: ({ signal }) => gateway.listAssignableTaskUsers(signal),
    enabled: hasGrant(access, "task.assign"),
    retry: false,
    staleTime: 60_000,
  });
  const departments = useQuery({
    queryKey: [...keys.all, "assignable-departments"],
    queryFn: ({ signal }) => gateway.listAssignableDepartments(signal),
    enabled: canCreate,
    retry: false,
    staleTime: 60_000,
  });
  const mutations = useTaskMutations(access);
  const changeFilters = useCallback((next: TaskListFilters) => {
    setFilters((current) => {
      if (
        current.search === next.search &&
        current.status === next.status &&
        current.assignedToMe === next.assignedToMe &&
        current.createdByMe === next.createdByMe &&
        current.overdueOnly === next.overdueOnly &&
        current.departmentId === next.departmentId
      ) {
        return current;
      }
      setPage(1);
      return next;
    });
  }, []);

  const error = list.error;
  if (
    error instanceof TasksRequestError &&
    (error.status === 401 || error.status === 403)
  ) {
    void client.invalidateQueries({ queryKey: accessKey });
  }

  const data = list.data;
  return (
    <>
      <TaskWorkspace
        tasks={data?.items ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? PAGE_SIZE}
        loading={list.isPending}
        fetching={list.isFetching}
        {...(error ? { error: error.message } : {})}
        onRetry={() => void list.refetch()}
        onFiltersChange={changeFilters}
        onPageChange={setPage}
        canFilterByReview={hasGrant(access, "task.review")}
        departments={departments.data ?? []}
        canCreate={canCreate}
        onOpenCreate={() => setCreateOpen(true)}
        collaboration={{
          detailKey: keys.detail,
          loadPreview: gateway.getTaskCollaboration,
          users: users.data ?? [],
          canComment: hasGrant(access, "task.comment.create"),
          canEditChecklist: creatorGatedFor(access, "task.update"),
          currentUserId: access.userId,
          canManageUnattributedChecklistItems: hasOrganizationGrant(
            access,
            "task.update",
          ),
          canToggleChecklist: canActOnAssignedTask(
            access,
            "task.update_progress",
          ),
          canTransition: canActOnAssignedTask(access, "task.update_status"),
          canSubmit: canActOnAssignedTask(access, "task.submit"),
          canReview: creatorGatedFor(access, "task.review"),
          canUpload: hasGrant(access, "task.attachment.create"),
          canAssign: hasGrant(access, "task.assign"),
          canManageAssignees: canManageAssigneesFor(access),
          ...(users.isError
            ? {
                assignmentDirectoryMessage:
                  "You can manage task assignments, but your role cannot browse the user directory. Ask an administrator for user directory access.",
              }
            : {}),
          addComment: (id, content) =>
            mutations.comment.mutateAsync({ id, content }),
          addChecklistItem: (id, description) =>
            mutations.addChecklistItem.mutateAsync({ id, description }),
          removeChecklistItem: (id, itemId) =>
            mutations.removeChecklistItem.mutateAsync({ id, itemId }),
          reorderChecklistItems: (id, orderedItemIds) =>
            mutations.reorderChecklistItems.mutateAsync({
              id,
              orderedItemIds,
            }),
          toggleChecklistItem: (id, itemId, completed) =>
            mutations.toggleChecklistItem.mutateAsync({
              id,
              itemId,
              completed,
            }),
          transition: (id, status) =>
            mutations.transition.mutateAsync({ id, status }),
          submit: (id) => mutations.submit.mutateAsync(id),
          review: (id, outcome, note) =>
            mutations.review.mutateAsync({ id, outcome, note }),
          upload: (id, file) => mutations.upload.mutateAsync({ id, file }),
          download: (id, fileId) =>
            gateway.getTaskFileDownloadGrant(id, fileId),
          addAssignee: (id, userId) =>
            mutations.addAssignee.mutateAsync({ id, userId }),
          removeAssignee: (id, userId) =>
            mutations.removeAssignee.mutateAsync({ id, userId }),
          listSubtasks: async (parentTaskId, signal) => {
            const page = await gateway.listTasks(
              { parentTaskId, pageSize: 100 },
              signal,
            );
            return page.items;
          },
          createSubtask: (parentTaskId, values) =>
            mutations.create.mutateAsync({ ...values, parentTaskId }),
          loadEligibleAssignees: (departmentId, signal) =>
            gateway.listEligibleAssignees(departmentId, signal),
        }}
      />
      {canCreate ? (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          departments={departments.data ?? []}
          departmentLocked={!canCreateTasksForAnyDepartment(access)}
          loadEligibleAssignees={(departmentId, signal) =>
            gateway.listEligibleAssignees(departmentId, signal)
          }
          onCreate={(values) => mutations.create.mutateAsync(values)}
          onUploadAttachment={(taskId, file) =>
            mutations.upload.mutateAsync({ id: taskId, file })
          }
          onCreated={() => {
            setPage(1);
            void list.refetch();
          }}
        />
      ) : null}
    </>
  );
}
