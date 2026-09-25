import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags } from "@/lib/api";
import { useAuth } from "./useAuth";

export function useFeatureFlags() {
  const { user, isSuperAdmin } = useAuth();

  const { data: flags, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: getFeatureFlags,
    enabled: !!user && !isSuperAdmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  function isModuleEnabled(module: string): boolean {
    // SUPER_ADMIN always sees everything
    if (isSuperAdmin) return true;
    // While loading, default to enabled so nothing flashes away
    if (!flags) return true;
    const flag = flags.find((f) => f.module === module);
    // If no flag exists for this module, treat as enabled
    return flag ? flag.enabled : true;
  }

  return { isModuleEnabled, isLoading: isLoading && !isSuperAdmin };
}
