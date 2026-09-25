import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getMaintenanceStatus, onMaintenanceChange } from "@/lib/api";

export function useAuth() {
  const [, setLocation] = useLocation();
  const [maintenance, setMaintenance] = useState(() => getMaintenanceStatus());

  useEffect(() => {
    const unsub = onMaintenanceChange(() => {
      setMaintenance(getMaintenanceStatus());
    });
    return () => { unsub(); };
  }, []);

  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (!isLoading && isError) {
      // Check if we're in maintenance mode before redirecting to login
      const { isMaintenanceMode } = getMaintenanceStatus();
      if (isMaintenanceMode) {
        // Stay on current page — MaintenancePage will render via App.tsx
        return;
      }
      setLocation("/login");
    }
  }, [isError, isLoading, setLocation]);

  const isSuperAdmin = user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_OWNER";
  const isAdmin = isSuperAdmin || user?.role === "ADMIN" || user?.role === "WORKSPACE_OWNER" || user?.role === "WORKSPACE_ADMIN";
  const isManager = isAdmin || user?.role === "MANAGER" || user?.role === "TEAM_MANAGER";
  const canSendOutreach = user?.role !== "VIEWER" && user?.role !== "READ_ONLY";
  const isViewer = user?.role === "VIEWER" || user?.role === "READ_ONLY";

  // Owner-controlled tenant flags — only true when PLATFORM_OWNER has explicitly enabled them
  const byokEnabled = !!(user as any)?.byokEnabled;
  const aiDiagnosisEnabled = !!(user as any)?.aiDiagnosisEnabled;

  return {
    user,
    isLoading,
    isError,
    isMaintenanceMode: maintenance.isMaintenanceMode,
    maintenanceInfo: maintenance.maintenanceInfo,
    isSuperAdmin,
    isAdmin,
    isManager,
    canSendOutreach,
    isViewer,
    byokEnabled,
    aiDiagnosisEnabled,
  };
}
