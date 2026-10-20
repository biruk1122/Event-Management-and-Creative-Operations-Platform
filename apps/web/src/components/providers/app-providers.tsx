"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { subscribeSessionEvents } from "@/lib/api/session-events";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );
  useEffect(() => {
    let stop: (() => void) | undefined;
    let mounted = true;
    const unsubscribe = subscribeSessionEvents((event) => {
      if (event.type !== "renewed") {
        void queryClient.cancelQueries();
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== "auth",
        });
        queryClient.setQueryData(["auth", "access"], null);
      }
      queryClient.setQueryData(
        ["auth", "current-user"],
        event.type === "ended" ? null : event.user,
      );
      if (event.type !== "ended") {
        void queryClient.invalidateQueries(
          { queryKey: ["auth", "access"] },
          { cancelRefetch: false },
        );
      }
    });
    void import("@/lib/api/browser").then(({ browserSession }) => {
      if (mounted) stop = browserSession.start();
    });
    return () => {
      mounted = false;
      stop?.();
      unsubscribe();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
