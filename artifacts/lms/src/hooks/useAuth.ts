import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["auth", "me"],
    queryFn: () => api.get("/api/auth/me"),
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !error,
    isCoach: user?.role === "OPERATOR",
    isManager: user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN",
    isAdmin: user?.role === "ADMIN" || user?.role === "SUPER_ADMIN",
  };
}
