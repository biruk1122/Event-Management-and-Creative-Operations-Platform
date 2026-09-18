"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./todo-gateway";
import type { TodoFormValues } from "../lib/todo-outcome";
import type { TodoItem } from "../lib/todo-types";

/** Query keys namespaced by the acting user and a signature of their grants,
 * matching `calendarKeys`'s own convention - a permission change never
 * serves cache written under a different authority. */
export function todoKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["todos", access.userId, scope] as const;
  return {
    all,
    list: [...all, "list"] as const,
    events: [...all, "assignable-events"] as const,
    projects: [...all, "assignable-projects"] as const,
  };
}

export function useTodos(access: CurrentAccess) {
  const keys = todoKeys(access);
  return useQuery({
    queryKey: keys.list,
    queryFn: ({ signal }) => gateway.listTodos(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useTodoMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = todoKeys(access);
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: keys.all });
  };

  return {
    create: useMutation({
      mutationFn: gateway.createTodo,
      onSettled: reconcile,
    }),
    update: useMutation({
      mutationFn: ({ id, values }: { id: string; values: TodoFormValues }) =>
        gateway.updateTodo(id, values),
      onSettled: reconcile,
    }),
    toggleStatus: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: TodoItem["status"];
      }) => gateway.toggleTodoStatus(id, status),
      onSettled: reconcile,
    }),
    remove: useMutation({
      mutationFn: gateway.deleteTodo,
      onSettled: reconcile,
    }),
  };
}
