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

import {
  type TaskListFilters,
  hasGrant,
  hasOrganizationGrant,
  creatorGatedFor,
  canReviewFor,
  canManageAssigneesFor,
  canActOnAssignedTask,
  isReadOnlyTask,
} from "../lib/task-access";
import * as gateway from "../api/tasks-gateway";
import { TasksRequestError } from "../api/tasks-gateway";
import { taskKeys, useTaskMutations } from "../api/tasks-queries";
import {
  canCreateTasks,
  canCreateTasksForAnyDepartment,
} from "../lib/task-access";
import { listCampaigns } from "@/features/campaigns/api/campaigns-gateway";
import { listEvents } from "@/features/events/api/events-gateway";

import { CreateTaskDialog } from "./create-task-dialog";
import { TaskWorkspace } from "./tasks-workspace";

const PAGE_SIZE = 25;

export function TasksManager({
  access,
  readOnly = false,
  departmentId: lockedDepartmentId,
}: {
  access: CurrentAccess;
  /** Embedded where the viewer only oversees the records (EVE-229): no
   * create, edit or submit controls, whatever the viewer's own grants. */
  readOnly?: boolean;
  /** One department's view (EVE-232); overrides the department filter. */
  departmentId?: string;
}) {
  const [filters, setFilters] = useState<TaskListFilters>({
    search: "",
    status: null,
    assignedToMe: false,
    createdByMe: false,
    reportingToMe: false,
    overdueOnly: false,
    reviewerNeeded: false,
    departmentId: null,
  });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const client = useQueryClient();
  const keys = taskKeys(access);
  const canCreate = !readOnly && canCreateTasks(access);
  const listParams = {
    search: filters.search,
    status: filters.status,
    ...(filters.assignedToMe ? { assigneeId: access.userId } : {}),
    ...(filters.createdByMe ? { createdById: access.userId } : {}),
    ...(filters.reportingToMe ? { reportToId: access.userId } : {}),
    ...(filters.overdueOnly ? { overdue: true } : {}),
    ...(filters.reviewerNeeded ? { reviewerUnresolved: true } : {}),
    ...((lockedDepartmentId ?? filters.departmentId)
      ? { departmentId: lockedDepartmentId ?? filters.departmentId! }
      : {}),
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
        current.reportingToMe === next.reportingToMe &&
        current.overdueOnly === next.overdueOnly &&
        current.reviewerNeeded === next.reviewerNeeded &&
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
        departments={lockedDepartmentId ? [] : (departments.data ?? [])}
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
          canReview: canReviewFor(access),
          canSetReportTo: access.role === "SUPER_ADMIN",
          loadEligibleRecipients: (departmentId, signal) =>
            gateway.listEligibleRecipients(departmentId, signal),
          setReportTo: (id, reviewerId, reason) =>
            mutations.setReportTo.mutateAsync({ id, reviewerId, reason }),
          canUpload: hasGrant(access, "task.attachment.create"),
          canAssign: hasGrant(access, "task.assign"),
          canManageAssignees: canManageAssigneesFor(access),
          isReadOnly: (task) => isReadOnlyTask(access, task),
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
          loadRelatedEvents={(signal) =>
            listEvents({ pageSize: 100 }, signal)
              .then((page) =>
                page.items.map((event) => ({ id: event.id, name: event.name })),
              )
              .catch(() => [])
          }
          loadRelatedCampaigns={(signal) =>
            listCampaigns({ pageSize: 100 }, signal)
              .then((page) =>
                page.items.map((campaign) => ({
                  id: campaign.id,
                  name: campaign.name,
                })),
              )
              .catch(() => [])
          }
          {...(access.role === "SUPER_ADMIN"
            ? {
                loadEligibleRecipients: (
                  departmentId: string,
                  signal?: AbortSignal,
                ) => gateway.listEligibleRecipients(departmentId, signal),
              }
            : {})}
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
