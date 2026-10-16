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
import type { TaskStatus } from "../lib/tasks-types";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskWorkspace } from "./tasks-workspace";

const PAGE_SIZE = 25;

function hasGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some((grant) => grant.permissionKey === permissionKey);
}

/** Owns API state so the workspace stays a rendering and interaction surface. */
export function TasksManager({ access }: { access: CurrentAccess }) {
  const [filters, setFilters] = useState<{
    search: string;
    status: TaskStatus | null;
  }>({
    search: "",
    status: null,
  });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const client = useQueryClient();
  const keys = taskKeys(access);
  const canCreate = canCreateTasks(access);
  const list = useQuery({
    queryKey: keys.list({ ...filters, page, pageSize: PAGE_SIZE }),
    queryFn: ({ signal }) =>
      gateway.listTasks({ ...filters, page, pageSize: PAGE_SIZE }, signal),
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
  const changeFilters = useCallback(
    (next: { search: string; status: TaskStatus | null }) => {
      setFilters((current) => {
        if (current.search === next.search && current.status === next.status) {
          return current;
        }
        setPage(1);
        return next;
      });
    },
    [],
  );

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
        canCreate={canCreate}
        onOpenCreate={() => setCreateOpen(true)}
        collaboration={{
          detailKey: keys.detail,
          loadPreview: gateway.getTaskCollaboration,
          users: users.data ?? [],
          canComment: hasGrant(access, "task.comment.create"),
          canUpdateProgress: hasGrant(access, "task.update_progress"),
          canTransition: hasGrant(access, "task.update_status"),
          canSubmit: hasGrant(access, "task.submit"),
          canReview: hasGrant(access, "task.review"),
          canUpload: hasGrant(access, "task.attachment.create"),
          canAssign: hasGrant(access, "task.assign"),
          ...(users.isError
            ? {
                assignmentDirectoryMessage:
                  "You can manage task assignments, but your role cannot browse the user directory. Ask an administrator for user directory access.",
              }
            : {}),
          addComment: (id, content) =>
            mutations.comment.mutateAsync({ id, content }),
          updateProgress: (id, progress) =>
            mutations.progress.mutateAsync({ id, progress }),
          transition: (id, status) =>
            mutations.transition.mutateAsync({ id, status }),
          submit: (id) => mutations.submit.mutateAsync(id),
          review: (id, outcome, note) =>
            mutations.review.mutateAsync({ id, outcome, note }),
          upload: (id, file) => mutations.upload.mutateAsync({ id, file }),
          addAssignee: (id, userId) =>
            mutations.addAssignee.mutateAsync({ id, userId }),
          removeAssignee: (id, userId) =>
            mutations.removeAssignee.mutateAsync({ id, userId }),
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
