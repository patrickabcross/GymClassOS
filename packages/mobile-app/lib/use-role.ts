// useRole — reads the caller's role once via GET /api/m/me (MA3-01) and caches
// it in TanStack Query (5-min staleTime). Drives the role-branched tab set
// (app/(tabs)/_layout.tsx) and is available app-wide for role-aware UI.
//
// Defaults to "member" while loading/erroring so the member experience is the
// safe fallback — the teacher/admin surfaces only render once the role is known
// to be non-member. Role discovery is UX-only; every /api/m/teacher/* route is
// independently gated server-side by requireTeacher (MA3-01/02).
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type AppRole = "admin" | "teacher" | "member";

export function useRole(): {
  role: AppRole;
  trainerId: string | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/api/m/me"),
    staleTime: 5 * 60 * 1000,
  });
  return {
    role: (data?.role as AppRole) ?? "member",
    trainerId: data?.trainerId ?? null,
    isLoading,
  };
}
