"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AuthUser,
  fetchCurrentUser,
  login,
  type LoginResult,
  logout,
} from "./auth-gateway";
import type { LoginValues } from "../lib/login-schema";

export const authKeys = {
  currentUser: ["auth", "current-user"] as const,
};

/** The signed-in account, or null when there is no valid session. */
export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: authKeys.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
}

/** Sign in and seed the session cache from the response on success. */
export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation<LoginResult, Error, LoginValues>({
    mutationFn: login,
    onSuccess: (result) => {
      if (result.outcome.status === "success") {
        queryClient.setQueryData<AuthUser | null>(
          authKeys.currentUser,
          result.user,
        );
      }
    },
  });
}

/** Sign out and drop the session cache so consumers re-check immediately. */
export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: logout,
    onSettled: () => {
      queryClient.setQueryData<AuthUser | null>(authKeys.currentUser, null);
      void queryClient.invalidateQueries({ queryKey: authKeys.currentUser });
    },
  });
}
