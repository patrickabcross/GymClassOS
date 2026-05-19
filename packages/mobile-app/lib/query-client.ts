// Single shared TanStack QueryClient + provider wrapper for the mobile app.
// staleTime is generous (30s) — demo doesn't need real-time. Production tuning
// for D2-04/D2-05/D2-06 happens in those plans.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}
