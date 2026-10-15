"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { CreateTaskDialog } from "@/features/tasks/components/create-task-dialog";
import * as taskGateway from "@/features/tasks/api/tasks-gateway";
import {
  dateLabel,
  taskStatusLabel,
  type Task,
  type TaskStatus,
} from "@/features/tasks/lib/tasks-types";

import type { Production } from "../lib/production-types";

const STATUS_VARIANT: Record<
  TaskStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  TODO: "secondary",
  IN_PROGRESS: "default",
  UNDER_REVIEW: "outline",
  BLOCKED: "destructive",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

function isOverdue(task: Task): boolean {
  return (
    task.dueAt !== null &&
    new Date(task.dueAt).getTime() < Date.now() &&
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED"
  );
}

export function ProductionSchedulePanel({
  access,
  production,
  canCreate,
}: {
  access: CurrentAccess;
  production: Production;
  canCreate: boolean;
}) {
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const tasksQuery = useQuery({
    queryKey: ["tasks", access.userId, "by-workspace", production.workspaceId],
    queryFn: ({ signal }) =>
      taskGateway.listTasks(
        { workspaceId: production.workspaceId, pageSize: 100 },
        signal,
      ),
    retry: false,
  });
  const departmentsQuery = useQuery({
    queryKey: ["tasks", access.userId, "production-department-choice"],
    queryFn: ({ signal }) => taskGateway.listAssignableDepartments(signal),
    enabled: canCreate && production.departmentId !== null,
    retry: false,
    staleTime: 60_000,
  });

  const tasks = tasksQuery.data?.items ?? [];
  const overdue = tasks.filter(isOverdue);
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const ownDepartment = (departmentsQuery.data ?? []).find(
    (department) => department.id === production.departmentId,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <strong>{tasks.length}</strong> total
          </span>
          <span>
            <strong>{completed.length}</strong> completed
          </span>
          <span className={overdue.length > 0 ? "text-destructive" : ""}>
            <strong>{overdue.length}</strong> overdue
          </span>
          <span className={blocked.length > 0 ? "text-destructive" : ""}>
            <strong>{blocked.length}</strong> blocked
          </span>
        </div>
        {canCreate ? (
          production.departmentId === null ? (
            <p className="text-muted-foreground text-sm">
              Assign a department to this production to add schedule items.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              New schedule item
            </Button>
          )
        ) : null}
      </div>

      {tasksQuery.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading schedule…
        </p>
      ) : tasksQuery.isError ? (
        <p role="alert" className="text-destructive text-sm">
          The schedule could not be loaded.
        </p>
      ) : tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No schedule items yet for this production.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border text-sm">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-muted-foreground text-xs">
                  Due {dateLabel(task.dueAt)}
                  {isOverdue(task) ? " · overdue" : ""}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[task.status]}>
                {taskStatusLabel(task.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {canCreate && production.departmentId ? (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          departments={ownDepartment ? [ownDepartment] : []}
          departmentLocked
          workspaceId={production.workspaceId}
          loadEligibleAssignees={(departmentId, signal) =>
            taskGateway.listEligibleAssignees(departmentId, signal)
          }
          onCreate={(values) => taskGateway.createTask(values)}
          onUploadAttachment={(taskId, file) =>
            taskGateway.uploadTaskFile(taskId, file)
          }
          onCreated={() => {
            void client.invalidateQueries({
              queryKey: [
                "tasks",
                access.userId,
                "by-workspace",
                production.workspaceId,
              ],
            });
          }}
        />
      ) : null}
    </div>
  );
}
