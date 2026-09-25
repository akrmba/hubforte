import { useState, useEffect, useMemo, useCallback } from "react";
import { logUserAction } from "../lib/analytics";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getSuperAdminFeatureFlags,
  toggleFeatureFlag,
  getSuperAdminDiagnostics,
  resolveError,
  api,
  type FeatureFlag,
  getAiConfig,
  saveAiConfig,
  getSuperAdminAiLogs,
  getTenants,
  createTenant,
  updateTenant,
  updateTenantStatus,
  getTenantFeatureFlags,
  toggleTenantFeatureFlag,
  getTenantAiSettings,
  updateTenantAiSettings,
  type TenantAdminUser,
  type Tenant,
  type TenantFeatureFlag,
  type TenantAiSettings,
} from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, Building2, Users, UserCheck, Landmark, TrendingUp, Mail, LifeBuoy, BarChart2, HeartPulse, Database, RefreshCw, CheckCircle, AlertTriangle, XCircle, BookOpen, User, Copy, Cpu, Clock, ShieldAlert, Activity, Eye, X as XIcon, Zap, Brain, Save, Play, Key } from "lucide-react";
import { PoundSterling } from "lucide-react";
import { format, subHours, startOfHour, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend, CartesianGrid } from "recharts";
import { useToast } from "@/hooks/use-toast";

const MODULE_CONFIG: Record<string, { label: string; description: string; icon: any }> = {
  organisations: {
    label: "Organisations",
    description: "Schools, companies, trusts, and other organisations",
    icon: Building2,
  },
  contacts: {
    label: "Contacts",
    description: "Individual contacts linked to organisations",
    icon: Users,
  },
  activities: {
    label: "Activities",
    description: "Activity timeline and interaction tracking",
    icon: Activity,
  },
  volunteers: {
    label: "Volunteers",
    description: "Volunteer management with DBS compliance tracking",
    icon: UserCheck,
  },
  funders: {
    label: "Funders",
    description: "Trusts, foundations, corporate and government funders",
    icon: Landmark,
  },
  pipeline: {
    label: "Pipeline",
    description: "Funding opportunities and pipeline stages",
    icon: TrendingUp,
  },
  outreach: {
    label: "Outreach & Campaigns",
    description: "Email outreach, campaigns, and templates",
    icon: Mail,
  },
  support: {
    label: "Support Tickets",
    description: "Support ticket management and tracking",
    icon: LifeBuoy,
  },
  reports: {
    label: "Reports",
    description: "Analytics reports with charts and CSV exports",
    icon: BarChart2,
  },
  schools: {
    label: "Schools",
    description: "Hubforte school partnerships and pipeline management",
    icon: Building2,
  },
  trusts: {
    label: "Trusts",
    description: "Multi-academy trusts and school group management",
    icon: Building2,
  },
  sponsors: {
    label: "Sponsors",
    description: "Corporate and individual sponsors for Hubforte programmes",
    icon: PoundSterling,
  },
  funding: {
    label: "Funding",
    description: "Funding opportunities linked to sponsors and programmes",
    icon: PoundSterling,
  },
  programmes: {
    label: "Programmes",
    description: "Hubforte coaching programmes delivered in schools",
    icon: BookOpen,
  },
  students: {
    label: "Students",
    description: "Student participants with safeguarding and consent tracking",
    icon: User,
  },
};

type TenantUpdateInput = Partial<{
  name: string;
  slug: string;
  domain: string;
  active: boolean;
  suspended: boolean;
}>;

type TenantFormState = {
  name: string;
  slug: string;
  domain: string;
  active: boolean;
};

function slugifyTenantName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTenantForm(tenant: Tenant | null): TenantFormState {
  return {
    name: tenant?.name ?? "",
    slug: tenant?.slug ?? "",
    domain: tenant?.domain ?? "",
    active: tenant?.active ?? true,
  };
}

function tenantStatusBadgeClass(status: Tenant["status"]): string {
  return status === "suspended"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function tenantStatusLabel(status: Tenant["status"]): string {
  return status === "suspended" ? "Suspended" : "Active";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// --- Pill indicator for the live status bar ---
function StatusPill({ label, status, detail }: { label: string; status: "green" | "amber" | "red" | "grey"; detail?: string }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800 border-emerald-300",
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    red: "bg-red-100 text-red-800 border-red-300",
    grey: "bg-gray-100 text-gray-500 border-gray-300",
  };
  const dotColors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    grey: "bg-gray-400",
  };
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${colors[status]}`}>
      <div className={`h-2 w-2 rounded-full ${dotColors[status]}`} />
      <span>{label}</span>
      {detail && <span className="opacity-70">({detail})</span>}
    </div>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
    EXECUTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
    REJECTED: "bg-gray-50 text-gray-700 border-gray-200",
    SKIPPED: "bg-gray-50 text-gray-500 border-gray-200",
  };
  return map[status] || "bg-gray-50 text-gray-700 border-gray-200";
}

// --- Group recentActivity into 1h buckets for bar chart ---
function buildHourlyBuckets(recentActivity: any[]): { hour: string; avgMs: number }[] {
  const now = new Date();
  const buckets: Record<string, number[]> = {};

  // Create 12 empty buckets
  for (let i = 11; i >= 0; i--) {
    const h = subHours(now, i);
    const key = format(startOfHour(h), "ha").toLowerCase();
    buckets[key] = [];
  }

  // Fill from recentActivity
  for (const r of recentActivity || []) {
    const ts = new Date(r.timestamp);
    const key = format(startOfHour(ts), "ha").toLowerCase();
    if (buckets[key] && r.durationMs != null) {
      buckets[key].push(Number(r.durationMs));
    }
  }

  return Object.entries(buckets).map(([hour, values]) => ({
    hour,
    avgMs: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
  }));
}

export default function SuperAdminPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'SuperAdminPage' });
  }, []);

  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showNewTenantDialog, setShowNewTenantDialog] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newTenantDomain, setNewTenantDomain] = useState("");
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState("");
  const [newTenantAdminFirstName, setNewTenantAdminFirstName] = useState("");
  const [newTenantAdminLastName, setNewTenantAdminLastName] = useState("");
  const [newTenantAdminPassword, setNewTenantAdminPassword] = useState("");
  const [isTenantSlugDirty, setIsTenantSlugDirty] = useState(false);
  const [provisionedAdmins, setProvisionedAdmins] = useState<Record<string, TenantAdminUser>>({});
  const [tenantForm, setTenantForm] = useState<TenantFormState>(buildTenantForm(null));
  const [showByokDisableConfirm, setShowByokDisableConfirm] = useState(false);
  const [pendingByokDisable, setPendingByokDisable] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      setLocation("/");
    }
  }, [authLoading, isSuperAdmin, setLocation]);

  // Feature flags
  const { data: flags, isLoading } = useQuery({
    queryKey: ["super-admin-feature-flags"],
    queryFn: getSuperAdminFeatureFlags,
    enabled: isSuperAdmin,
  });

  const flagMutation = useMutation({
    mutationFn: ({ module, enabled }: { module: string; enabled: boolean }) =>
      toggleFeatureFlag(module, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: getTenants,
    enabled: isSuperAdmin,
  });

  const selectedTenant = useMemo(
    () => tenants?.find((tenant: Tenant) => tenant.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId]
  );

  const { data: tenantAiSettings, isLoading: tenantAiSettingsLoading } = useQuery({
    queryKey: ["tenant-ai-settings", selectedTenantId],
    queryFn: () => getTenantAiSettings(selectedTenantId!),
    enabled: isSuperAdmin && !!selectedTenantId,
  });

  const tenantAiSettingsMutation = useMutation({
    mutationFn: ({ tenantId, data }: { tenantId: string; data: Partial<TenantAiSettings> }) =>
      updateTenantAiSettings(tenantId, data),
    onMutate: async ({ tenantId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["tenant-ai-settings", tenantId] });
      const previous = queryClient.getQueryData<TenantAiSettings>(["tenant-ai-settings", tenantId]);
      queryClient.setQueryData<TenantAiSettings>(["tenant-ai-settings", tenantId], (cur) =>
        cur ? { ...cur, ...data } : cur
      );
      return { previous, tenantId };
    },
    onSuccess: (updated, { tenantId }) => {
      queryClient.setQueryData(["tenant-ai-settings", tenantId], updated);
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({ title: "AI permissions updated" });
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tenant-ai-settings", context.tenantId], context.previous);
      }
      toast({ title: "Failed to update AI permissions", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const { data: tenantFlags, isLoading: tenantFlagsLoading } = useQuery({
    queryKey: ["tenant-feature-flags", selectedTenantId],
    queryFn: () => getTenantFeatureFlags(selectedTenantId!),
    enabled: isSuperAdmin && !!selectedTenantId,
  });

  const selectedProvisionedAdmin = useMemo(
    () => (selectedTenantId ? provisionedAdmins[selectedTenantId] ?? null : null),
    [provisionedAdmins, selectedTenantId]
  );

  const createTenantMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: ({ tenant, adminUser }) => {
      queryClient.setQueryData<Tenant[]>(["tenants"], (current) => {
        if (!current) return [tenant];
        return [...current.filter((item) => item.id !== tenant.id), tenant];
      });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      if (adminUser) {
        setProvisionedAdmins((current) => ({ ...current, [tenant.id]: adminUser }));
      }
      setSelectedTenantId(tenant.id);
      setShowNewTenantDialog(false);
      setNewTenantName("");
      setNewTenantSlug("");
      setNewTenantDomain("");
      setNewTenantAdminEmail("");
      setNewTenantAdminFirstName("");
      setNewTenantAdminLastName("");
      setNewTenantAdminPassword("");
      setIsTenantSlugDirty(false);
      toast({
        title: "Tenant created",
        description: adminUser
          ? `${tenant.name} and its first admin are ready to configure.`
          : `${tenant.name} is ready to configure.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create tenant", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: ({
      id,
      data,
      successTitle,
      successDescription,
    }: {
      id: string;
      data: TenantUpdateInput;
      successTitle?: string;
      successDescription?: string;
    }) =>
      updateTenant(id, data).then((tenant) => ({ tenant, successTitle, successDescription })),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["tenants"] });
      const previousTenants = queryClient.getQueryData<Tenant[]>(["tenants"]);

      queryClient.setQueryData<Tenant[]>(["tenants"], (current) =>
        current?.map((item) => (item.id === id ? { ...item, ...data } : item)) ?? current
      );

      return { previousTenants };
    },
    onSuccess: ({ tenant, successTitle, successDescription }) => {
      queryClient.setQueryData<Tenant[]>(["tenants"], (current) =>
        current?.map((item) => (item.id === tenant.id ? tenant : item)) ?? [tenant]
      );
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({
        title: successTitle || "Tenant updated",
        description: successDescription || `${tenant.name} was updated.`,
      });
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousTenants) {
        queryClient.setQueryData(["tenants"], context.previousTenants);
      }
      toast({ title: "Failed to update tenant", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const tenantStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      successDescription,
    }: {
      id: string;
      status: "active" | "suspended";
      successDescription: string;
    }) => updateTenantStatus(id, status).then((tenant) => ({ tenant, successDescription })),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["tenants"] });
      const previousTenants = queryClient.getQueryData<Tenant[]>(["tenants"]);

      queryClient.setQueryData<Tenant[]>(["tenants"], (current) =>
        current?.map((item) =>
          item.id === id
            ? { ...item, status, suspended: status === "suspended" }
            : item
        ) ?? current
      );

      return { previousTenants };
    },
    onSuccess: ({ tenant, successDescription }) => {
      queryClient.setQueryData<Tenant[]>(["tenants"], (current) =>
        current?.map((item) => (item.id === tenant.id ? tenant : item)) ?? [tenant]
      );
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({
        title: "Tenant status updated",
        description: successDescription,
      });
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousTenants) {
        queryClient.setQueryData(["tenants"], context.previousTenants);
      }
      toast({
        title: "Failed to update tenant status",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const tenantFlagMutation = useMutation({
    mutationFn: ({ tenantId, module, enabled }: { tenantId: string; module: string; enabled: boolean }) =>
      toggleTenantFeatureFlag(tenantId, module, enabled),
    onMutate: async ({ tenantId, module, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["tenant-feature-flags", tenantId] });
      const previousFlags = queryClient.getQueryData<TenantFeatureFlag[]>(["tenant-feature-flags", tenantId]);

      queryClient.setQueryData<TenantFeatureFlag[]>(["tenant-feature-flags", tenantId], (current) =>
        current?.map((flag) => (flag.module === module ? { ...flag, enabled } : flag)) ?? current
      );

      return { previousFlags, tenantId };
    },
    onSuccess: (updatedFlag, { tenantId, module }) => {
      queryClient.setQueryData<TenantFeatureFlag[]>(["tenant-feature-flags", tenantId], (current) => {
        if (!current) return [updatedFlag];
        return current.map((flag) => (flag.module === updatedFlag.module ? updatedFlag : flag));
      });
      queryClient.invalidateQueries({ queryKey: ["tenant-feature-flags", tenantId] });
      toast({
        title: "Feature flag updated",
        description: `${MODULE_CONFIG[module]?.label || module} is now ${updatedFlag.enabled ? "enabled" : "disabled"}.`,
      });
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousFlags) {
        queryClient.setQueryData(["tenant-feature-flags", context.tenantId], context.previousFlags);
      }
      toast({
        title: "Failed to update feature flag",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Diagnostics data (shared by System Health + Diagnostics tabs)
  const { data: diagnosticsData, isLoading: diagLoading, refetch: refetchDiag } = useQuery({
    queryKey: ["super-admin-diagnostics"],
    queryFn: getSuperAdminDiagnostics,
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  });

  // API health check
  const { data: apiHealth } = useQuery({
    queryKey: ["api-health-check"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/healthz");
        return res.status === 200 ? "green" : "red";
      } catch {
        return "red";
      }
    },
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
  });

  // Resolve error mutation
  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveError(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-diagnostics"] });
    },
  });

  // Remediation queries for SUPER_ADMIN
  const { data: policies } = useQuery({
    queryKey: ["remediation-policies"],
    queryFn: () => api.get("/remediation/policies"),
    enabled: isSuperAdmin,
    retry: false,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["remediation-dashboard"],
    queryFn: () => api.get<any>("/remediation/dashboard"),
    enabled: isSuperAdmin,
    retry: false,
    refetchInterval: 30000,
  });

  const { data: allRuns } = useQuery({
    queryKey: ["remediation-runs"],
    queryFn: () => api.get("/remediation/runs"),
    enabled: isSuperAdmin,
    retry: false,
  });

  const [triggerPolicyName, setTriggerPolicyName] = useState("");
  const [triggerTargetId, setTriggerTargetId] = useState("");
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);

  const superAdminTriggerMutation = useMutation({
    mutationFn: ({ policyName, targetId }: { policyName: string; targetId: string }) =>
      api.post("/remediation/super-admin/trigger", { policyName, targetId }),
    onSuccess: (data: any) => {
      toast({ title: "Policy triggered", description: `Run created: ${data.run?.id}` });
      queryClient.invalidateQueries({ queryKey: ["remediation-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["remediation-runs"] });
      setTriggerResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Trigger failed", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  // Derived data
  const dbStatus = useMemo(() => {
    if (!diagnosticsData?.systemOverview) return "grey";
    const ms = diagnosticsData.systemOverview.dbResponseMs;
    if (!diagnosticsData.systemOverview.dbConnected) return "red";
    if (ms > 1000) return "red";
    if (ms > 500) return "amber";
    return "green";
  }, [diagnosticsData]) as "green" | "amber" | "red" | "grey";

  const hourlyData = useMemo(
    () => buildHourlyBuckets(diagnosticsData?.recentActivity || []),
    [diagnosticsData?.recentActivity]
  );

  const last1Hour = diagnosticsData?.last1Hour;
  const errorRate = last1Hour && last1Hour.totalRequests > 0
    ? ((last1Hour.errorRequests / last1Hour.totalRequests) * 100)
    : 0;

  const unresolvedErrors = useMemo(
    () => (diagnosticsData?.topErrors || []).filter((e: any) => !e.resolved).sort((a: any, b: any) => (b.occurrenceCount ?? 0) - (a.occurrenceCount ?? 0)),
    [diagnosticsData?.topErrors]
  );

  const copyErrorForAI = useCallback((err: any) => {
    const text = `Error context for Hubforte:
Route: ${err.route || "unknown"}
Message: ${err.errorMessage}
Stack: ${err.stack || "N/A"}
Plain English: ${err.plainEnglish || "N/A"}
Request ID: ${err.requestId || "N/A"}
Please explain what caused this error and what to check first.`;
    copyToClipboard(text);
    setCopiedId(err.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  useEffect(() => {
    if (!isTenantSlugDirty) {
      setNewTenantSlug(slugifyTenantName(newTenantName));
    }
  }, [newTenantName, isTenantSlugDirty]);

  useEffect(() => {
    if (!tenants?.length) {
      setSelectedTenantId(null);
      return;
    }

    setSelectedTenantId((currentTenantId) =>
      currentTenantId && tenants.some((tenant) => tenant.id === currentTenantId)
        ? currentTenantId
        : tenants[0].id
    );
  }, [tenants]);

  useEffect(() => {
    setTenantForm(buildTenantForm(selectedTenant));
  }, [selectedTenant]);

  if (authLoading || !isSuperAdmin) return null;

  function statCardClass(value: number, amberThreshold: number, redThreshold: number) {
    if (value >= redThreshold) return "border-red-300 bg-red-50";
    if (value >= amberThreshold) return "border-amber-300 bg-amber-50";
    return "border-gray-200";
  }

  const tenantModuleFlags = (tenantFlags || [])
    .filter((flag: TenantFeatureFlag) => MODULE_CONFIG[flag.module])
    .sort((a: TenantFeatureFlag, b: TenantFeatureFlag) =>
      MODULE_CONFIG[a.module].label.localeCompare(MODULE_CONFIG[b.module].label)
    );

  const tenantDetailsDirty = selectedTenant
    ? tenantForm.name.trim() !== selectedTenant.name
      || tenantForm.slug.trim() !== selectedTenant.slug
      || tenantForm.domain.trim() !== (selectedTenant.domain ?? "")
    : false;

  function resetNewTenantDialog() {
    setShowNewTenantDialog(false);
    setNewTenantName("");
    setNewTenantSlug("");
    setNewTenantDomain("");
    setNewTenantAdminEmail("");
    setNewTenantAdminFirstName("");
    setNewTenantAdminLastName("");
    setNewTenantAdminPassword("");
    setIsTenantSlugDirty(false);
  }

  const newTenantHasAnyAdminFields = [
    newTenantAdminEmail,
    newTenantAdminFirstName,
    newTenantAdminLastName,
    newTenantAdminPassword,
  ].some((value) => value.trim().length > 0);
  const newTenantHasAllAdminFields = [
    newTenantAdminEmail,
    newTenantAdminFirstName,
    newTenantAdminLastName,
    newTenantAdminPassword,
  ].every((value) => value.trim().length > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-800 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white/20 p-2.5">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Super Admin Panel</h1>
            <p className="text-purple-200 text-sm mt-1">
              System-level controls — modules, health, and monitoring
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList className="mb-6">
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Tenants
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2">
            <Crown className="h-4 w-4" /> Module Toggles
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4" /> System Health
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Diagnostics
          </TabsTrigger>
          <TabsTrigger value="remediation" className="flex items-center gap-2">
            <Zap className="h-4 w-4" /> Remediation
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="h-4 w-4" /> AI
          </TabsTrigger>
          <TabsTrigger value="ops" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Operations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <div className="space-y-6">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Tenants
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    View tenants, create new workspaces, and manage tenant-level module access.
                  </p>
                </div>
                <Button onClick={() => setShowNewTenantDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
                  New Tenant
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {tenantsLoading ? (
                  <div className="p-8 text-center text-gray-500 text-sm">Loading tenants...</div>
                ) : !tenants || tenants.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No tenants found yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenants.map((tenant: Tenant) => (
                        <TableRow
                          key={tenant.id}
                          onClick={() => setSelectedTenantId(tenant.id)}
                          className={`cursor-pointer transition-colors ${
                            selectedTenantId === tenant.id ? "bg-indigo-50/80 hover:bg-indigo-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-gray-900">{tenant.name}</p>
                              {tenant.domain && <p className="text-xs text-gray-500 mt-1">{tenant.domain}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-gray-600">{tenant.slug}</TableCell>
                          <TableCell className="text-sm">{tenant.userCount}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={tenantStatusBadgeClass(tenant.status)}
                              >
                                {tenantStatusLabel(tenant.status)}
                              </Badge>
                              {!tenant.active && (
                                <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {tenant.createdAt ? format(new Date(tenant.createdAt), "d MMM yyyy") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {selectedTenant ? (
              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="bg-indigo-50/40 border-b border-indigo-100">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      {selectedTenant.name}
                    </CardTitle>
                    <Badge variant="outline" className={tenantStatusBadgeClass(selectedTenant.status)}>
                      {tenantStatusLabel(selectedTenant.status)}
                    </Badge>
                    {!selectedTenant.active && (
                      <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Update tenant details and control which modules are enabled for this workspace.
                  </p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="tenant-name">Name</Label>
                      <Input
                        id="tenant-name"
                        value={tenantForm.name}
                        onChange={(event) => setTenantForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tenant-slug">Slug</Label>
                      <Input
                        id="tenant-slug"
                        value={tenantForm.slug}
                        onChange={(event) => setTenantForm((current) => ({ ...current, slug: slugifyTenantName(event.target.value) }))}
                        className="mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tenant-domain">Domain</Label>
                      <Input
                        id="tenant-domain"
                        value={tenantForm.domain}
                        onChange={(event) => setTenantForm((current) => ({ ...current, domain: event.target.value }))}
                        placeholder="Optional custom domain"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Active</p>
                          <p className="text-xs text-gray-500">Controls whether the tenant is available for normal use.</p>
                        </div>
                        <Switch
                          checked={tenantForm.active}
                          disabled={updateTenantMutation.isPending}
                          onCheckedChange={(checked) => {
                            setTenantForm((current) => ({ ...current, active: checked }));
                            updateTenantMutation.mutate({
                              id: selectedTenant.id,
                              data: { active: checked },
                              successTitle: "Tenant status updated",
                              successDescription: `${selectedTenant.name} is now ${checked ? "active" : "inactive"}.`,
                            });
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Suspension</p>
                          <p className="text-xs text-gray-500">Suspended tenants are blocked on authenticated requests until reactivated.</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={tenantStatusBadgeClass(selectedTenant.status)}>
                            {tenantStatusLabel(selectedTenant.status)}
                          </Badge>
                          <Button
                            type="button"
                            disabled={tenantStatusMutation.isPending}
                            onClick={() =>
                              tenantStatusMutation.mutate({
                                id: selectedTenant.id,
                                status: selectedTenant.status === "suspended" ? "active" : "suspended",
                                successDescription:
                                  selectedTenant.status === "suspended"
                                    ? `${selectedTenant.name} has been reactivated.`
                                    : `${selectedTenant.name} has been suspended.`,
                              })
                            }
                            className={
                              selectedTenant.status === "suspended"
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-red-600 hover:bg-red-700"
                            }
                          >
                            {tenantStatusMutation.isPending
                              ? "Updating..."
                              : selectedTenant.status === "suspended"
                                ? "Reactivate"
                                : "Suspend"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={() =>
                        updateTenantMutation.mutate({
                          id: selectedTenant.id,
                          data: {
                            name: tenantForm.name.trim(),
                            slug: tenantForm.slug.trim(),
                            domain: tenantForm.domain.trim(),
                          },
                          successTitle: "Tenant details saved",
                          successDescription: `${selectedTenant.name} details were updated.`,
                        })
                      }
                      disabled={
                        updateTenantMutation.isPending
                        || !tenantForm.name.trim()
                        || !tenantForm.slug.trim()
                        || !tenantDetailsDirty
                      }
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {updateTenantMutation.isPending ? "Saving..." : "Save Details"}
                    </Button>
                  </div>

                  {selectedProvisionedAdmin && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">Provisioned Admin</h3>
                          <p className="mt-2 text-sm font-medium text-emerald-950">
                            {selectedProvisionedAdmin.name || "Admin user"}
                          </p>
                          <p className="text-sm text-emerald-800">{selectedProvisionedAdmin.email || "No email recorded"}</p>
                          <p className="mt-2 text-xs text-emerald-700">
                            Created {formatDistanceToNow(new Date(selectedProvisionedAdmin.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit border-emerald-300 bg-white text-emerald-700">
                          {selectedProvisionedAdmin.role}
                        </Badge>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Feature Flags</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Module availability for <span className="font-medium text-gray-700">{selectedTenant.name}</span>.
                      </p>
                    </div>

                    {tenantFlagsLoading ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                        Loading tenant feature flags...
                      </div>
                    ) : tenantModuleFlags.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                        No tenant feature flags are configured yet.
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        {tenantModuleFlags.map((flag: TenantFeatureFlag) => {
                          const config = MODULE_CONFIG[flag.module];
                          const Icon = config.icon;

                          return (
                            <div key={flag.module} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <div className={`rounded-lg p-2 ${flag.enabled ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"}`}>
                                    <Icon className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-gray-900">{config.label}</p>
                                      <Badge
                                        variant="outline"
                                        className={flag.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}
                                      >
                                        {flag.enabled ? "Enabled" : "Disabled"}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-sm text-gray-500">{config.description}</p>
                                    <p className="mt-2 text-xs text-gray-400">
                                      {flag.updatedAt
                                        ? `Updated ${format(new Date(flag.updatedAt), "d MMM yyyy HH:mm")}`
                                        : "Not updated yet"}
                                      {flag.updatedBy ? ` by ${flag.updatedBy}` : ""}
                                    </p>
                                  </div>
                                </div>
                                <Switch
                                  checked={flag.enabled}
                                  disabled={tenantFlagMutation.isPending}
                                  onCheckedChange={(checked) =>
                                    tenantFlagMutation.mutate({
                                      tenantId: selectedTenant.id,
                                      module: flag.module,
                                      enabled: checked,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* AI Permissions */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">AI Permissions</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Control AI capabilities for <span className="font-medium text-gray-700">{selectedTenant.name}</span>.
                      </p>
                    </div>

                    {tenantAiSettingsLoading ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                        Loading AI permissions...
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* BYOK toggle */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className={`rounded-lg p-2 ${tenantAiSettings?.byokEnabled ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"}`}>
                                <Key className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-gray-900">Allow BYOK</p>
                                  <Badge
                                    variant="outline"
                                    className={tenantAiSettings?.byokEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}
                                  >
                                    {tenantAiSettings?.byokEnabled ? "Enabled" : "Disabled"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-gray-500">
                                  When enabled, this tenant can configure their own AI provider and key in their workspace settings. When disabled, they use the platform default AI.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={tenantAiSettings?.byokEnabled ?? false}
                              disabled={tenantAiSettingsMutation.isPending}
                              onCheckedChange={(checked) => {
                                if (!checked) {
                                  setPendingByokDisable(selectedTenant.id);
                                  setShowByokDisableConfirm(true);
                                } else {
                                  tenantAiSettingsMutation.mutate({ tenantId: selectedTenant.id, data: { byokEnabled: true } });
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* AI Diagnosis toggle */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className={`rounded-lg p-2 ${tenantAiSettings?.aiDiagnosisEnabled ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"}`}>
                                <Brain className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-gray-900">Allow AI Ticket Diagnosis</p>
                                  <Badge
                                    variant="outline"
                                    className={tenantAiSettings?.aiDiagnosisEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}
                                  >
                                    {tenantAiSettings?.aiDiagnosisEnabled ? "Enabled" : "Disabled"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-gray-500">
                                  When enabled, the AI Diagnose button appears on support tickets for this tenant. Uses platform AI only — does not count against their AI budget.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={tenantAiSettings?.aiDiagnosisEnabled ?? false}
                              disabled={tenantAiSettingsMutation.isPending}
                              onCheckedChange={(checked) =>
                                tenantAiSettingsMutation.mutate({ tenantId: selectedTenant.id, data: { aiDiagnosisEnabled: checked } })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-gray-200 shadow-sm">
                <CardContent className="p-8 text-center text-sm text-gray-500">
                  Select a tenant to review its details and module access.
                </CardContent>
              </Card>
            )}

            {/* BYOK disable confirmation dialog */}
            <AlertDialog open={showByokDisableConfirm} onOpenChange={setShowByokDisableConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable BYOK?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Disabling BYOK will remove this tenant's stored AI key. They will revert to the platform default AI. Continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingByokDisable(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      if (pendingByokDisable) {
                        tenantAiSettingsMutation.mutate({ tenantId: pendingByokDisable, data: { byokEnabled: false } });
                      }
                      setPendingByokDisable(null);
                      setShowByokDisableConfirm(false);
                    }}
                  >
                    Disable BYOK
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog
              open={showNewTenantDialog}
              onOpenChange={(open) => {
                if (open) {
                  setShowNewTenantDialog(true);
                  return;
                }
                resetNewTenantDialog();
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Tenant</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newTenantHasAnyAdminFields && !newTenantHasAllAdminFields) {
                      toast({
                        title: "Complete the admin details",
                        description: "Provide email, first name, last name, and password to provision the first admin user.",
                        variant: "destructive",
                      });
                      return;
                    }
                    createTenantMutation.mutate({
                      name: newTenantName.trim(),
                      slug: newTenantSlug.trim(),
                      domain: newTenantDomain.trim() || undefined,
                      ...(newTenantHasAnyAdminFields
                        ? {
                            adminEmail: newTenantAdminEmail.trim(),
                            adminFirstName: newTenantAdminFirstName.trim(),
                            adminLastName: newTenantAdminLastName.trim(),
                            adminPassword: newTenantAdminPassword,
                          }
                        : {}),
                    });
                  }}
                >
                  <div>
                    <Label htmlFor="new-tenant-name">Name</Label>
                    <Input
                      id="new-tenant-name"
                      value={newTenantName}
                      onChange={(event) => setNewTenantName(event.target.value)}
                      className="mt-1"
                      placeholder="Acme Foundation"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-tenant-slug">Slug</Label>
                    <Input
                      id="new-tenant-slug"
                      value={newTenantSlug}
                      onChange={(event) => {
                        setIsTenantSlugDirty(true);
                        setNewTenantSlug(slugifyTenantName(event.target.value));
                      }}
                      className="mt-1 font-mono"
                      placeholder="hubforte"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-tenant-domain">Domain</Label>
                    <Input
                      id="new-tenant-domain"
                      value={newTenantDomain}
                      onChange={(event) => setNewTenantDomain(event.target.value)}
                      className="mt-1"
                      placeholder="Optional custom domain"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">First Admin User</p>
                      <p className="text-xs text-gray-500 mt-1">Optional. Leave blank to create the tenant without provisioning an admin user yet.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="new-tenant-admin-email">Admin email</Label>
                        <Input
                          id="new-tenant-admin-email"
                          value={newTenantAdminEmail}
                          onChange={(event) => setNewTenantAdminEmail(event.target.value)}
                          className="mt-1"
                          placeholder="admin@example.org"
                          type="email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-tenant-admin-password">Admin password</Label>
                        <Input
                          id="new-tenant-admin-password"
                          value={newTenantAdminPassword}
                          onChange={(event) => setNewTenantAdminPassword(event.target.value)}
                          className="mt-1"
                          placeholder="At least 8 characters"
                          type="password"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-tenant-admin-first-name">First name</Label>
                        <Input
                          id="new-tenant-admin-first-name"
                          value={newTenantAdminFirstName}
                          onChange={(event) => setNewTenantAdminFirstName(event.target.value)}
                          className="mt-1"
                          placeholder="Alex"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-tenant-admin-last-name">Last name</Label>
                        <Input
                          id="new-tenant-admin-last-name"
                          value={newTenantAdminLastName}
                          onChange={(event) => setNewTenantAdminLastName(event.target.value)}
                          className="mt-1"
                          placeholder="Morgan"
                        />
                      </div>
                    </div>
                    {newTenantHasAnyAdminFields && !newTenantHasAllAdminFields && (
                      <p className="text-xs text-amber-700">All admin fields are required if you want to provision the first admin user now.</p>
                    )}
                    {newTenantAdminPassword.length > 0 && newTenantAdminPassword.length < 8 && (
                      <p className="text-xs text-amber-700">Admin password must be at least 8 characters.</p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetNewTenantDialog}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        createTenantMutation.isPending
                        || !newTenantName.trim()
                        || !newTenantSlug.trim()
                        || (newTenantHasAnyAdminFields && (!newTenantHasAllAdminFields || newTenantAdminPassword.length < 8))
                      }
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* Module Toggles Tab */}
        <TabsContent value="modules">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Module Toggles
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Disabled modules are hidden from all non-Super Admin users and their API routes return 403
              </p>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading flags...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {flags?.filter((flag: FeatureFlag) => MODULE_CONFIG[flag.module]).map((flag: FeatureFlag) => {
                  const config = MODULE_CONFIG[flag.module];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <div key={flag.module} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`rounded-lg p-2 ${flag.enabled ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{config.label}</span>
                            <Badge
                              variant={flag.enabled ? "default" : "secondary"}
                              className={`text-[10px] ${flag.enabled ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-100"}`}
                            >
                              {flag.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{config.description}</p>
                          {flag.updatedBy && (
                            <p className="text-xs text-gray-400 mt-1">
                              Last changed by {flag.updatedByName || "unknown"}{" "}
                              {flag.updatedAt && `on ${new Date(flag.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                            </p>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={flag.enabled}
                        disabled={flagMutation.isPending}
                        onCheckedChange={(checked) =>
                          flagMutation.mutate({ module: flag.module, enabled: checked })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* System Health Tab — enhanced with 5 sections                 */}
        {/* ============================================================ */}
        <TabsContent value="health">
          <div className="space-y-6">
            {/* Section A — Live Status Bar */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Live Status</h2>
              <div className="flex flex-wrap gap-3">
                <StatusPill
                  label="API"
                  status={(apiHealth as "green" | "red") || "grey"}
                />
                <StatusPill
                  label="DB"
                  status={dbStatus}
                  detail={diagnosticsData?.systemOverview?.dbResponseMs != null ? `${diagnosticsData.systemOverview.dbResponseMs}ms` : undefined}
                />
                <StatusPill
                  label="Gmail"
                  status={diagnosticsData?.systemOverview?.gmailConfigured ? "green" : "grey"}
                />
                <StatusPill
                  label="OpenAI"
                  status={diagnosticsData?.systemOverview?.openaiConfigured ? "green" : "grey"}
                />
              </div>
            </div>

            {/* Section B — Last Hour Summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Last Hour Summary</h3>
              {diagLoading && !diagnosticsData ? (
                <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-gray-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Total Requests</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.totalRequests ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-gray-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Errors</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.errorRequests ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card className={statCardClass(errorRate, 5, 15)}>
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Error Rate</p>
                      <p className={`text-2xl font-bold mt-1 ${errorRate >= 15 ? "text-red-700" : errorRate >= 5 ? "text-amber-700" : "text-gray-900"}`}>
                        {errorRate.toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-gray-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Response</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.avgResponseMs ?? 0}ms</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Section C — Active Issues */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Active Issues</h3>
              {unresolvedErrors.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm text-emerald-800">No unresolved errors. All clear.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                  {unresolvedErrors.map((err: any) => (
                    <div key={err.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {/* Occurrence count badge */}
                        <Badge variant="outline" className={`shrink-0 mt-0.5 text-xs ${(err.occurrenceCount ?? 0) > 10 ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-100 text-gray-600 border-gray-300"}`}>
                          {err.occurrenceCount ?? 1}x
                        </Badge>
                        <div className="flex-1 min-w-0">
                          {/* Plain English summary (prominent) */}
                          <p className="text-sm font-medium text-gray-900">{err.plainEnglish || err.errorMessage}</p>
                          {/* Route + method */}
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{err.route || "unknown route"}</p>
                          {/* First seen / last seen */}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                            <span>First: {err.firstSeen ? format(new Date(err.firstSeen), "d MMM HH:mm") : "—"}</span>
                            <span>Last: {err.lastSeen ? format(new Date(err.lastSeen), "d MMM HH:mm") : "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => resolveMutation.mutate(err.id)}
                            disabled={resolveMutation.isPending}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Mark Resolved
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => copyErrorForAI(err)}
                          >
                            <Copy className="h-3 w-3 mr-1" /> {copiedId === err.id ? "Copied!" : "Copy for AI"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section D — Response Time Bar Chart */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Response Time (Last 12 Hours)</h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="ms" />
                    <Tooltip
                      formatter={(value: number) => [`${value}ms`, "Avg Response"]}
                      labelFormatter={(label: string) => `Hour: ${label}`}
                    />
                    <ReferenceLine y={2000} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "2s limit", fill: "#ef4444", fontSize: 10 }} />
                    <Bar dataKey="avgMs" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Section E — Auth Events */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Auth Events (Last 24h)</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Login Failures</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{diagnosticsData?.authEvents?.loginFailures ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Role Denials</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{diagnosticsData?.authEvents?.roleDenials ?? 0}</p>
                  </CardContent>
                </Card>
              </div>
              {diagnosticsData?.authEvents?.recentFailures?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Time</th>
                        <th className="px-4 py-2 text-left">Error</th>
                        <th className="px-4 py-2 text-left">Request ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {diagnosticsData.authEvents.recentFailures.map((f: any) => (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                            {f.timestamp ? format(new Date(f.timestamp), "d MMM HH:mm:ss") : "—"}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{f.errorMessage}</td>
                          <td className="px-4 py-2 font-mono text-xs text-gray-400">{f.requestId || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center">Auto-refreshes every 60 seconds</p>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* Diagnostics Tab                                              */}
        {/* ============================================================ */}
        <TabsContent value="diagnostics">
          <DiagnosticsTab
            diagnosticsData={diagnosticsData}
            diagLoading={diagLoading}
            refetchDiag={refetchDiag}
            resolveMutation={resolveMutation}
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            copyErrorForAI={copyErrorForAI}
          />
        </TabsContent>

        {/* ============================================================ */}
        {/* Remediation Tab — SUPER_ADMIN manual trigger                 */}
        {/* ============================================================ */}
        <TabsContent value="remediation">
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">Pending Approval</p>
                  <p className="text-2xl font-bold text-amber-600">{(dashboard?.pendingRuns || []).length}</p>
                </CardContent>
              </Card>
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">Completed Today</p>
                  <p className="text-2xl font-bold text-emerald-600">{(dashboard?.completedToday || []).length}</p>
                </CardContent>
              </Card>
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">Recent Failures</p>
                  <p className="text-2xl font-bold text-red-600">{(dashboard?.failedRuns || []).length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Manual trigger card */}
            <Card className="border-indigo-200 shadow-sm">
              <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
                <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-indigo-600" /> Manual Policy Trigger</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 mb-4">Trigger any remediation policy manually against any user or account. This bypasses auto-detection and runs immediately.</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label htmlFor="sa-policy">Policy</Label>
                    <Select value={triggerPolicyName} onValueChange={setTriggerPolicyName}>
                      <SelectTrigger id="sa-policy" className="mt-1">
                        <SelectValue placeholder="Select a policy" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Array.isArray(policies) ? policies : []).map((p: any) => (
                          <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sa-target">Target ID (user ID, campaign ID, etc.)</Label>
                    <Input
                      id="sa-target"
                      value={triggerTargetId}
                      onChange={(e) => setTriggerTargetId(e.target.value)}
                      placeholder="usr_xxx, cmp_xxx, etc."
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => superAdminTriggerMutation.mutate({ policyName: triggerPolicyName, targetId: triggerTargetId })}
                  disabled={!triggerPolicyName || !triggerTargetId || superAdminTriggerMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <Zap className="h-4 w-4 mr-1" /> {superAdminTriggerMutation.isPending ? "Triggering..." : "Trigger Policy"}
                </Button>
              </CardContent>
            </Card>

            {/* Pending approvals */}
            {dashboard && (dashboard.pendingRuns || []).length > 0 && (
              <Card className="border-amber-200 shadow-sm">
                <CardHeader className="bg-amber-50/50 border-b border-amber-100">
                  <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /> Pending Approvals</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Policy</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Detected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard.pendingRuns || []).map((run: any) => {
                        const ctx = run.input?.context || {};
                        const targetLabel = ctx.email || ctx.campaignName || ctx.targetId || run.policyId;
                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium text-sm">{run.policyName}</TableCell>
                            <TableCell className="text-sm text-gray-600">{targetLabel}</TableCell>
                            <TableCell className="text-xs text-gray-400">
                              {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Run history */}
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Run History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Triggered By</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!allRuns || (Array.isArray(allRuns) ? allRuns : []).length === 0) ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-500">No runs yet</TableCell></TableRow>
                    ) : (
                      (Array.isArray(allRuns) ? allRuns : []).map((run: any) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium text-sm">{run.policyName || run.policyId}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] uppercase ${statusBadge(run.status)}`}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{run.triggeredByName || run.triggeredById}</TableCell>
                          <TableCell className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* AI Configuration Tab                                         */}
        {/* ============================================================ */}
        <TabsContent value="ai">
          <AiConfigTab />
        </TabsContent>

        {/* ============================================================ */}
        {/* Operations Dashboard Tab                                      */}
        {/* ============================================================ */}
        <TabsContent value="ops">
          <OpsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// AI Configuration Tab
// ============================================================
function AiConfigTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const { data: aiConfig, isLoading: configLoading } = useQuery({
    queryKey: ["super-admin-ai-config"],
    queryFn: getAiConfig,
  });

  const { data: aiLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["super-admin-ai-logs"],
    queryFn: getSuperAdminAiLogs,
    refetchInterval: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: ({ provider, model }: { provider: string; model: string }) =>
      saveAiConfig(provider, model),
    onSuccess: () => {
      toast({ title: "AI config saved", description: "Default provider and model updated." });
      queryClient.invalidateQueries({ queryKey: ["super-admin-ai-config"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (aiConfig) {
      setSelectedProvider(aiConfig.defaultProvider);
      setSelectedModel(aiConfig.defaultModel);
    }
  }, [aiConfig]);

  const modelsForProvider = useMemo(() => {
    if (!aiConfig?.models) return [];
    return aiConfig.models.filter((m) => m.provider === selectedProvider);
  }, [aiConfig?.models, selectedProvider]);

  if (configLoading) return <div className="p-8 text-center text-gray-500 text-sm">Loading AI config...</div>;

  return (
    <div className="space-y-6">
      {/* AI Configuration Card */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-purple-50/50 border-b border-purple-100">
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-purple-600" /> AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-gray-600 mb-4">Set the default AI provider and model for all AI-powered features (email drafting, data cleaning, ticket diagnosis).</p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="ai-provider">Provider</Label>
              <Select value={selectedProvider} onValueChange={(v) => { setSelectedProvider(v); setSelectedModel(""); }}>
                <SelectTrigger id="ai-provider" className="mt-1">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {(aiConfig?.availableProviders || []).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ai-model">Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="ai-model" className="mt-1">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelsForProvider.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={() => saveMutation.mutate({ provider: selectedProvider, model: selectedModel })}
            disabled={!selectedProvider || !selectedModel || saveMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </CardContent>
      </Card>

      {/* AI Logs Table */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gray-50/50 border-b border-gray-100">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Recent AI Calls</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading AI logs...</div>
          ) : !aiLogs || aiLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No AI calls recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Input Tokens</TableHead>
                  <TableHead>Output Tokens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Feature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiLogs.map((log: any) => (
                  <TableRow key={log.id} className={log.success ? "" : "bg-red-50/50"}>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {log.createdAt ? format(new Date(log.createdAt), "d MMM HH:mm:ss") : "—"}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{log.provider || "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{log.model || "—"}</TableCell>
                    <TableCell className="text-sm">{log.latencyMs != null ? `${log.latencyMs}ms` : "—"}</TableCell>
                    <TableCell className="text-sm">{log.inputTokens ?? "—"}</TableCell>
                    <TableCell className="text-sm">{log.outputTokens ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${log.success ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-red-100 text-red-700 border-red-300"}`}>
                        {log.success ? "Success" : "Failed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{log.feature || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Diagnostics Tab — with sub-tabs: Overview, Errors, Chart
// ============================================================
function DiagnosticsTab({
  diagnosticsData,
  diagLoading,
  refetchDiag,
  resolveMutation,
  copiedId,
  setCopiedId,
  copyErrorForAI,
}: {
  diagnosticsData: any;
  diagLoading: boolean;
  refetchDiag: () => void;
  resolveMutation: any;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  copyErrorForAI: (err: any) => void;
}) {
  const [snapshotCopied, setSnapshotCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "errors" | "chart">("overview");
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

  const copyFullSnapshot = useCallback(() => {
    const prefix = "I am debugging a CRM application called Hubforte. Here is the current system diagnostics snapshot. Please analyse this and tell me: what is broken, what is slow, and what should I fix first?\n\n";
    navigator.clipboard.writeText(prefix + JSON.stringify(diagnosticsData, null, 2));
    setSnapshotCopied(true);
    setTimeout(() => setSnapshotCopied(false), 2000);
  }, [diagnosticsData]);

  const last1Hour = diagnosticsData?.last1Hour;
  const unresolvedErrors = (diagnosticsData?.topErrors || [])
    .filter((e: any) => !e.resolved)
    .sort((a: any, b: any) => (b.occurrenceCount ?? 0) - (a.occurrenceCount ?? 0));

  // Error logs from diagnostics data (10-day retention)
  const allErrorLogs: any[] = diagnosticsData?.allErrorLogs || [];
  // Chart data from diagnostics data
  const chartData: any[] = diagnosticsData?.dailyChart || [];
  // Selected error detail from embedded data
  const selectedError = selectedErrorId
    ? allErrorLogs.find((e: any) => e.id === selectedErrorId) || null
    : null;

  const subTabClass = (tab: string) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeSubTab === tab
        ? "bg-indigo-100 text-indigo-700"
        : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Diagnostics</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchDiag()} disabled={diagLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${diagLoading ? "animate-spin" : ""}`} />
            {diagLoading ? "Refreshing..." : "Force Refresh"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={copyFullSnapshot}
            disabled={!diagnosticsData}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            {snapshotCopied ? "Copied!" : "Copy for AI"}
          </Button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200">
        <button className={subTabClass("overview")} onClick={() => setActiveSubTab("overview")}>
          <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Overview</span>
        </button>
        <button className={subTabClass("errors")} onClick={() => setActiveSubTab("errors")}>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Error Logs</span>
        </button>
        <button className={subTabClass("chart")} onClick={() => setActiveSubTab("chart")}>
          <span className="flex items-center gap-1.5"><BarChart2 className="h-3.5 w-3.5" /> Success / Errors</span>
        </button>
      </div>

      {/* ---- Overview Sub-Tab ---- */}
      {activeSubTab === "overview" && (
        <>
          {diagLoading && !diagnosticsData ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading diagnostics...</div>
          ) : diagnosticsData ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Requests (1h)</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.totalRequests ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200 cursor-pointer hover:shadow-md hover:border-red-300 transition-all" onClick={() => setActiveSubTab("errors")}>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Errors (1h)</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{last1Hour?.errorRequests ?? 0}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Click to view details</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Slow Requests</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.slowRequests ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Unique Users</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{last1Hour?.uniqueUsers ?? 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Errors */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Errors (Last 24h)</h3>
                {unresolvedErrors.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm text-emerald-800">No unresolved errors.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                    {unresolvedErrors.map((err: any) => (
                      <div key={err.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className={`shrink-0 mt-0.5 text-xs ${(err.occurrenceCount ?? 0) > 10 ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-100 text-gray-600 border-gray-300"}`}>
                            {err.occurrenceCount ?? 1}x
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{err.plainEnglish || err.errorMessage}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{err.route || "unknown route"}</p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                              <span>First: {err.firstSeen ? format(new Date(err.firstSeen), "d MMM HH:mm") : "—"}</span>
                              <span>Last: {err.lastSeen ? format(new Date(err.lastSeen), "d MMM HH:mm") : "—"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => setSelectedErrorId(err.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => resolveMutation.mutate(err.id)}
                              disabled={resolveMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Success vs Errors Graph (on Overview) */}
              {chartData && chartData.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Success vs Errors (Last 10 Days)</h3>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val: string) => {
                            try { return format(new Date(val + "T00:00:00"), "d MMM"); } catch { return val; }
                          }}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value: number, name: string) => [value.toLocaleString(), name === "success" ? "Success" : "Errors"]}
                          labelFormatter={(label: string) => {
                            try { return format(new Date(label + "T00:00:00"), "d MMM yyyy"); } catch { return label; }
                          }}
                        />
                        <Legend />
                        <Bar dataKey="success" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="errors" name="Errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Last 20 Requests Table */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Last 20 Requests</h3>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Time</th>
                          <th className="px-4 py-2 text-left">Method</th>
                          <th className="px-4 py-2 text-left">Path</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Duration</th>
                          <th className="px-4 py-2 text-left">User</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(diagnosticsData.recentActivity || []).map((r: any, i: number) => {
                          const isCritical = r.statusCode >= 500;
                          const isError = r.statusCode >= 400;
                          const isSlow = r.durationMs > 2000;
                          let rowBg = "";
                          if (isCritical) rowBg = "bg-red-50";
                          else if (isError || isSlow) rowBg = "bg-amber-50";

                          return (
                            <tr key={r.requestId || i} className={`${rowBg} hover:bg-gray-50`}>
                              <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                                {r.timestamp ? format(new Date(r.timestamp), "HH:mm:ss") : "—"}
                              </td>
                              <td className="px-4 py-2 font-mono text-xs">{r.method}</td>
                              <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-[200px] truncate">{r.path}</td>
                              <td className="px-4 py-2">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${isCritical ? "bg-red-100 text-red-700 border-red-300" : isError ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-emerald-100 text-emerald-700 border-emerald-300"}`}
                                >
                                  {r.statusCode}
                                </Badge>
                              </td>
                              <td className={`px-4 py-2 text-xs ${isSlow ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                                {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-400 font-mono">{r.userId ? r.userId.substring(0, 8) + "..." : "anon"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}

      {/* ---- Errors Sub-Tab ---- */}
      {activeSubTab === "errors" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Error Logs</h3>
              <p className="text-xs text-gray-400 mt-0.5">Showing errors from the last 10 days</p>
            </div>
            <p className="text-xs text-gray-500">{allErrorLogs.length} error{allErrorLogs.length !== 1 ? "s" : ""}</p>
          </div>

          {diagLoading && !diagnosticsData ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading error logs...</div>
          ) : allErrorLogs.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <p className="text-sm text-emerald-800">No errors in the last 10 days. System is healthy!</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Route</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Duration</th>
                    <th className="px-4 py-2 text-left">Detail</th>
                    <th className="px-4 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allErrorLogs.map((log: any) => {
                    const isCritical = log.statusCode >= 500;
                    return (
                    <tr
                      key={log.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isCritical ? "bg-red-50/50" : "bg-amber-50/30"}`}
                      onClick={() => setSelectedErrorId(log.id)}
                    >
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {log.createdAt ? format(new Date(log.createdAt), "d MMM HH:mm:ss") : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 max-w-[200px] truncate">
                        <span className="text-gray-400 mr-1">{log.method}</span>
                        {log.route || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${
                          isCritical ? "bg-red-100 text-red-700 border-red-300"
                          : "bg-amber-100 text-amber-700 border-amber-300"
                        }`}>
                          {log.statusCode}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700 max-w-[250px] truncate">
                        {log.plainEnglish || log.message || (isCritical ? "Server error" : "Client error")}
                      </td>
                      <td className="px-4 py-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSelectedErrorId(log.id); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Chart Sub-Tab ---- */}
      {activeSubTab === "chart" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Success vs Errors (Last 10 Days)</h3>
            <p className="text-xs text-gray-400 mt-0.5">Daily breakdown of successful and failed requests</p>
          </div>

          {diagLoading && !diagnosticsData ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading chart data...</div>
          ) : chartData && chartData.length > 0 ? (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Requests</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {chartData.reduce((sum: number, d: any) => sum + d.total, 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-emerald-600 uppercase tracking-wider">Successful</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">
                      {chartData.reduce((sum: number, d: any) => sum + d.success, 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-red-600 uppercase tracking-wider">Errors</p>
                    <p className="text-2xl font-bold text-red-700 mt-1">
                      {chartData.reduce((sum: number, d: any) => sum + d.errors, 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Bar chart */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val: string) => {
                        try { return format(new Date(val + "T00:00:00"), "d MMM"); } catch { return val; }
                      }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === "success" ? "Success" : "Errors"]}
                      labelFormatter={(label: string) => {
                        try { return format(new Date(label + "T00:00:00"), "d MMM yyyy"); } catch { return label; }
                      }}
                    />
                    <Legend />
                    <Bar dataKey="success" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="errors" name="Errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No request data available for the last 10 days.
            </div>
          )}
        </div>
      )}

      {/* ---- Error Detail Modal ---- */}
      {selectedErrorId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedErrorId(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">Error Detail</h3>
              <button onClick={() => setSelectedErrorId(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedError ? (
              <div className="p-6 space-y-4">
                {/* Status badges */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${
                    selectedError.statusCode >= 500 ? "bg-red-100 text-red-700 border-red-300"
                    : "bg-amber-100 text-amber-700 border-amber-300"
                  }`}>
                    HTTP {selectedError.statusCode}
                  </Badge>
                  {selectedError.isCritical && (
                    <Badge className="text-xs bg-red-600 text-white">Critical</Badge>
                  )}
                  {selectedError.level && (
                    <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-300">
                      {selectedError.level.toUpperCase()}
                    </Badge>
                  )}
                  {selectedError.resolved ? (
                    <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300">Resolved</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">Open</Badge>
                  )}
                </div>

                {/* Plain English summary */}
                {selectedError.plainEnglish && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900">{selectedError.plainEnglish}</p>
                  </div>
                )}

                {/* Key details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">When</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {selectedError.createdAt ? format(new Date(selectedError.createdAt), "d MMM yyyy HH:mm:ss") : "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Duration</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {selectedError.durationMs != null ? `${selectedError.durationMs}ms` : "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Route</p>
                    <p className="text-sm font-mono text-gray-900 mt-0.5">
                      {selectedError.method && <span className="text-gray-400 mr-1">{selectedError.method}</span>}
                      {selectedError.route || "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Status Code</p>
                    <p className={`text-sm font-bold mt-0.5 ${selectedError.statusCode >= 500 ? "text-red-600" : "text-amber-600"}`}>
                      {selectedError.statusCode}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Request ID</p>
                    <p className="text-sm font-mono text-gray-900 mt-0.5 break-all">{selectedError.requestId || "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">User ID</p>
                    <p className="text-sm font-mono text-gray-900 mt-0.5 break-all">{selectedError.userId || "anonymous"}</p>
                  </div>
                </div>

                {/* Error message */}
                {selectedError.message && (
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Error Message</p>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800 font-mono whitespace-pre-wrap break-all">{selectedError.message}</p>
                    </div>
                  </div>
                )}

                {/* Fallback when no error_logs join match */}
                {!selectedError.message && (
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Error Info</p>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800">
                        {selectedError.statusCode >= 500
                          ? `Server error (HTTP ${selectedError.statusCode}) on ${selectedError.method} ${selectedError.route}`
                          : `Client error (HTTP ${selectedError.statusCode}) on ${selectedError.method} ${selectedError.route}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Stack trace */}
                {selectedError.stack && (
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Stack Trace</p>
                    <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all">{selectedError.stack}</pre>
                    </div>
                  </div>
                )}

                {/* Resolution info */}
                {selectedError.resolved && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                    <p className="text-[11px] text-emerald-600 uppercase tracking-wider">Resolved</p>
                    {selectedError.resolvedAt && (
                      <p className="text-sm text-emerald-800">
                        {format(new Date(selectedError.resolvedAt), "d MMM yyyy HH:mm:ss")}
                      </p>
                    )}
                    {selectedError.resolvedNote && (
                      <p className="text-sm text-emerald-700">{selectedError.resolvedNote}</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" onClick={() => copyErrorForAI(selectedError)}>
                    <Copy className="h-4 w-4 mr-1.5" /> {copiedId === selectedError.id ? "Copied!" : "Copy for AI"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">Error not found.</div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">Auto-refreshes every 60 seconds</p>
    </div>
  );
}

// ============================================================
// Operations Dashboard Tab (Task 7.8)
// ============================================================

type OpsReport = {
  id: string;
  reportText: string;
  severity: "ok" | "warning" | "critical";
  trigger: "scheduled" | "alarm";
  aiProvider: string | null;
  createdAt: string;
};

// Task 7.10 — one-click diagnostic prompts
const HEALTH_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Full System Check",
    prompt: "Run a full system check. Report on database health, error rate, slow requests, worker status, and any active alerts. Summarise in plain English.",
  },
  {
    label: "Database Health",
    prompt: "Check database health: connection pool, query latency, recent errors from DB operations. Flag anything unusual.",
  },
  {
    label: "Email Health",
    prompt: "Check email/Gmail health: recent send failures, OAuth token status, outreach queue backlog. Flag anything that needs attention.",
  },
  {
    label: "AI Health",
    prompt: "Check AI provider health: recent AI call failures, latency, provider errors. Flag any degraded providers.",
  },
  {
    label: "Worker Health",
    prompt: "Check background worker health: failed jobs in last 24h, remediation run failures, any stuck jobs. Recommend actions.",
  },
  {
    label: "LMS Data Integrity",
    prompt: "Check LMS data integrity: orphaned students, stale cohorts, expired tokens not revoked, stuck report generation. Flag issues.",
  },
  {
    label: "Backup Verification",
    prompt: "Verify backup status: when was the last successful backup, are there any backup failures logged, is the backup schedule running?",
  },
  {
    label: "Security Audit",
    prompt: "Run a security audit: recent auth failures, unusual access patterns, any accounts locked, failed login spikes. Flag anything suspicious.",
  },
];

// Task 7.12 — guided incident resolution steps
const INCIDENT_STEPS = [
  { label: "Generate AI Diagnostic", action: "generate" as const, description: "Get an AI analysis of current system state." },
  { label: "Run Health Check", action: "health" as const, description: "Verify database and server are responding." },
  { label: "Retry Failed Jobs", action: "retry" as const, description: "Re-queue any failed remediation runs from the last 24h." },
  { label: "Clear Circuit Breakers", action: "clear-cb" as const, description: "Reset any tripped circuit breakers." },
  { label: "Restart Worker", action: "restart" as const, description: "Restart the background worker if jobs are stuck." },
];

function OpsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentStep, setIncidentStep] = useState(0);

  const { data: reports = [], isLoading: reportsLoading } = useQuery<OpsReport[]>({
    queryKey: ["ops-reports"],
    queryFn: () => api.get<OpsReport[]>("/super-admin/ops/reports"),
    refetchInterval: 60_000,
  });

  const latestReport = reports[0] ?? null;

  const generateMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/generate-diagnostic", {}),
    onSuccess: () => {
      toast({ title: "Diagnostic generated", description: "New AI report created." });
      queryClient.invalidateQueries({ queryKey: ["ops-reports"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const retryJobsMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/retry-failed-jobs", {}),
    onSuccess: (data) => toast({ title: "Jobs retried", description: `${data.retried} job(s) re-queued.` }),
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const clearCBMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/clear-circuit-breakers", {}),
    onSuccess: () => toast({ title: "Circuit breakers cleared" }),
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const [restartIncidentAdvance, setRestartIncidentAdvance] = useState<(() => void) | null>(null);

  const restartMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/restart-worker", { confirm: true }),
    onSuccess: (data) => {
      toast({ title: "Restart logged", description: data.message });
      setConfirmRestart(false);
      if (restartIncidentAdvance) { restartIncidentAdvance(); setRestartIncidentAdvance(null); }
    },
    onError: (err: any) => { toast({ title: "Failed", description: err.message, variant: "destructive" }); setRestartIncidentAdvance(null); },
  });

  const healthMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/run-health-check", {}),
    onSuccess: (data) => toast({ title: "Health check", description: `DB: ${data.database} | Server: ${data.server}` }),
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const backupMutation = useMutation({
    mutationFn: () => api.post<any>("/super-admin/ops/run-backup", {}),
    onSuccess: (data) => toast({ title: "Backup requested", description: data.message }),
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // Task 7.12 — guided incident resolution: only advance step on mutation success
  const runIncidentStep = (action: typeof INCIDENT_STEPS[number]["action"]) => {
    const advance = () => setIncidentStep((s) => Math.min(s + 1, INCIDENT_STEPS.length - 1));
    if (action === "generate") generateMutation.mutate(undefined, { onSuccess: advance });
    else if (action === "health") healthMutation.mutate(undefined, { onSuccess: advance });
    else if (action === "retry") retryJobsMutation.mutate(undefined, { onSuccess: advance });
    else if (action === "clear-cb") clearCBMutation.mutate(undefined, { onSuccess: advance });
    else if (action === "restart") {
      // Store advance so restartMutation.onSuccess can call it after confirmed + succeeded
      setRestartIncidentAdvance(() => advance);
      setConfirmRestart(true);
    }
  };

  const severityColor = (s: string) => {
    if (s === "critical") return "text-red-600 bg-red-50 border-red-200";
    if (s === "warning") return "text-yellow-700 bg-yellow-50 border-yellow-200";
    return "text-green-700 bg-green-50 border-green-200";
  };

  const severityIcon = (s: string) => {
    if (s === "critical") return <XCircle className="h-5 w-5 text-red-500" />;
    if (s === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Quick Actions */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" /> Service Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              Generate Diagnostic
            </Button>
            <Button variant="outline" size="sm" onClick={() => healthMutation.mutate()} disabled={healthMutation.isPending}>
              <HeartPulse className="h-4 w-4 mr-2" /> Run Health Check
            </Button>
            <Button variant="outline" size="sm" onClick={() => retryJobsMutation.mutate()} disabled={retryJobsMutation.isPending}>
              <Play className="h-4 w-4 mr-2" /> Retry Failed Jobs
            </Button>
            <Button variant="outline" size="sm" onClick={() => clearCBMutation.mutate()} disabled={clearCBMutation.isPending}>
              <Zap className="h-4 w-4 mr-2" /> Clear Circuit Breakers
            </Button>
            <Button variant="outline" size="sm" onClick={() => backupMutation.mutate()} disabled={backupMutation.isPending}>
              <Database className="h-4 w-4 mr-2" /> Run Backup
            </Button>
            {!confirmRestart ? (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmRestart(true)}>
                <RefreshCw className="h-4 w-4 mr-2" /> Restart Worker
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Confirm restart?</span>
                <Button variant="destructive" size="sm" onClick={() => restartMutation.mutate()} disabled={restartMutation.isPending}>Yes</Button>
                <Button variant="outline" size="sm" onClick={() => { setConfirmRestart(false); setRestartIncidentAdvance(null); }}>Cancel</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: AI Status Report */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" /> AI Status Report
            {latestReport && (
              <Badge className={`ml-2 text-xs ${severityColor(latestReport.severity)}`}>
                {latestReport.severity.toUpperCase()}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : latestReport ? (
            <div className={`rounded-lg border p-4 ${severityColor(latestReport.severity)}`}>
              <div className="flex items-start gap-3">
                {severityIcon(latestReport.severity)}
                <div className="flex-1">
                  <p className="text-sm whitespace-pre-wrap">{latestReport.reportText.replace(/SEVERITY:.*$/m, "").trim()}</p>
                  <p className="text-xs mt-2 opacity-60">
                    {latestReport.trigger === "alarm" ? "Alarm-triggered" : "Scheduled"} · {formatDistanceToNow(new Date(latestReport.createdAt), { addSuffix: true })}
                    {latestReport.aiProvider ? ` · ${latestReport.aiProvider}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No reports yet. Click "Generate Diagnostic" to create one.</p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Report History */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Report History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-gray-500">No reports yet.</p>
          ) : (
            <div className="space-y-2">
              {reports.slice(0, 10).map((r) => (
                <div key={r.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${severityColor(r.severity)}`}>
                  {severityIcon(r.severity)}
                  <span className="flex-1 truncate">{r.reportText.replace(/SEVERITY:.*$/m, "").trim().slice(0, 120)}…</span>
                  <span className="text-xs opacity-60 shrink-0">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{r.trigger}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Task 7.10 — One-click diagnostic prompts */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4" /> Quick Diagnostic Prompts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">Click a prompt to copy it to clipboard, then paste into the Generate Diagnostic input or your AI assistant.</p>
          <div className="flex flex-wrap gap-2">
            {HEALTH_PROMPTS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(p.prompt).then(() =>
                    toast({ title: "Copied", description: `"${p.label}" prompt copied to clipboard.` })
                  );
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Task 7.12 — Guided incident resolution */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Guided Incident Resolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!incidentOpen ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600">Use this when you see a warning or critical alert. Walk through each step in order.</p>
              <Button size="sm" variant="outline" onClick={() => { setIncidentOpen(true); setIncidentStep(0); }}>
                <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" /> Start Incident Flow
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Step {incidentStep + 1} of {INCIDENT_STEPS.length}</p>
                <Button size="sm" variant="ghost" className="text-xs text-gray-400" onClick={() => { setIncidentOpen(false); setRestartIncidentAdvance(null); }}>Close</Button>
              </div>
              <div className="space-y-2">
                {INCIDENT_STEPS.map((step, i) => (
                  <div
                    key={step.action}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                      i < incidentStep ? "bg-green-50 border-green-200 text-green-700 opacity-60" :
                      i === incidentStep ? "bg-blue-50 border-blue-300 text-blue-800" :
                      "bg-gray-50 border-gray-200 text-gray-400"
                    }`}
                  >
                    {i < incidentStep ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : i === incidentStep ? (
                      <Activity className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-xs">{step.label}</p>
                      <p className="text-xs opacity-70">{step.description}</p>
                    </div>
                    {i === incidentStep && (
                      <Button size="sm" className="text-xs shrink-0" onClick={() => runIncidentStep(step.action)}>
                        Run
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {incidentStep >= INCIDENT_STEPS.length - 1 && (
                <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> All steps complete. Monitor the AI Status Report for recovery confirmation.
                </div>
              )}
              {/* Pre-formatted escalation message for developer */}
              <details className="mt-1">
                <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600">
                  Escalation: copy developer message →
                </summary>
                <div className="mt-2 rounded-md bg-gray-50 border border-gray-200 p-3 space-y-2">
                  <p className="text-xs text-gray-500">Copy this message and send to your developer:</p>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white border border-gray-100 rounded p-2 select-all">{`Hi, we have an active incident on Hubforte.

Severity: ${latestReport?.severity?.toUpperCase() ?? "UNKNOWN"}
Time: ${latestReport ? new Date(latestReport.createdAt).toISOString() : new Date().toISOString()}
Trigger: ${latestReport?.trigger ?? "manual"}

AI Diagnostic Summary:
${latestReport ? latestReport.reportText.replace(/SEVERITY:.*$/m, "").trim().slice(0, 500) : "(no report available — please generate a diagnostic first)"}

Steps already taken:
${INCIDENT_STEPS.slice(0, incidentStep + 1).map((s, i) => `${i + 1}. ${s.label}`).join("\n")}

Please investigate and advise.`}</pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      const msg = `Hi, we have an active incident on Hubforte.\n\nSeverity: ${latestReport?.severity?.toUpperCase() ?? "UNKNOWN"}\nTime: ${latestReport ? new Date(latestReport.createdAt).toISOString() : new Date().toISOString()}\nTrigger: ${latestReport?.trigger ?? "manual"}\n\nAI Diagnostic Summary:\n${latestReport ? latestReport.reportText.replace(/SEVERITY:.*$/m, "").trim().slice(0, 500) : "(no report available)"}\n\nSteps already taken:\n${INCIDENT_STEPS.slice(0, incidentStep + 1).map((s, i) => `${i + 1}. ${s.label}`).join("\n")}\n\nPlease investigate and advise.`;
                      navigator.clipboard.writeText(msg).then(() =>
                        toast({ title: "Copied", description: "Escalation message copied to clipboard." })
                      );
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy Message
                  </Button>
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
