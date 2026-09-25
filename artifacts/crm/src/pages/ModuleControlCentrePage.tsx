import { useState, useMemo } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTenants,
  getGlobalModules,
  getTenantModules,
  toggleGlobalModule,
  toggleTenantModule,
  resetTenantModules,
  type Tenant,
  type GlobalModule,
  type TenantModule,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  entities: "Entities",
  engagement: "Engagement",
  delivery: "Delivery",
  compliance: "Compliance",
  analytics: "Analytics",
  automation: "Automation",
  integrations: "Integrations",
};

const CORE_MODULES = ["contacts", "organisations"];

// ─── Global Defaults Section ─────────────────────────────────────────────────

function GlobalModulesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["global-modules"],
    queryFn: getGlobalModules,
  });

  const [pendingToggle, setPendingToggle] = useState<{ key: string; enabled: boolean } | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      toggleGlobalModule(key, enabled),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["global-modules"] });
      toast({
        title: `Module ${data.enabled ? "enabled" : "disabled"}`,
        description: data.tenantsAffected > 0
          ? `${data.tenantsAffected} tenant(s) without overrides will be affected.`
          : "No tenants affected (all have overrides).",
      });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["global-modules"] });
      toast({ title: "Failed to update module", description: err?.message, variant: "destructive" });
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, GlobalModule[]> = {};
    for (const m of modules) {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    }
    return map;
  }, [modules]);

  function handleToggle(mod: GlobalModule, newEnabled: boolean) {
    if (!newEnabled && CORE_MODULES.includes(mod.key)) {
      setPendingToggle({ key: mod.key, enabled: newEnabled });
      return;
    }
    if (!newEnabled && mod.required) {
      toast({ title: "Cannot disable required module", variant: "destructive" });
      return;
    }
    // Optimistic update
    queryClient.setQueryData<GlobalModule[]>(["global-modules"], (old) =>
      old?.map((m) => (m.key === mod.key ? { ...m, enabled: newEnabled } : m))
    );
    toggleMutation.mutate({ key: mod.key, enabled: newEnabled });
  }

  if (isLoading) return (
    <div className="space-y-4 p-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="space-y-1.5 flex-1 mr-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, mods]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="grid gap-2">
            {mods.map((mod) => (
              <div
                key={mod.key}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{mod.name}</span>
                    {mod.required && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                    {mod.dependencies.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        needs: {mod.dependencies.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{mod.description}</p>
                </div>
                <Switch
                  checked={mod.enabled}
                  disabled={mod.required || toggleMutation.isPending}
                  onCheckedChange={(v) => handleToggle(mod, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <AlertDialog open={!!pendingToggle} onOpenChange={() => setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disable core module?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingToggle?.key}</strong> is a core module. Disabling it will affect all
              tenants without an override and may break core CRM functionality. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingToggle) {
                  queryClient.setQueryData<GlobalModule[]>(["global-modules"], (old) =>
                    old?.map((m) => (m.key === pendingToggle.key ? { ...m, enabled: pendingToggle.enabled } : m))
                  );
                  toggleMutation.mutate(pendingToggle);
                }
                setPendingToggle(null);
              }}
            >
              Disable anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Per-Tenant Row ───────────────────────────────────────────────────────────

function TenantModuleRow({ tenant }: { tenant: Tenant }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["tenant-modules", tenant.id],
    queryFn: () => getTenantModules(tenant.id),
    enabled: expanded,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      toggleTenantModule(tenant.id, key, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenant.id] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenant.id] });
      toast({ title: "Toggle failed", description: err?.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetTenantModules(tenant.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenant.id] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({ title: "Modules reset", description: `${data.reset} module(s) reset to global defaults.` });
    },
    onError: (err: any) => {
      toast({ title: "Reset failed", description: err?.message, variant: "destructive" });
    },
  });

  function handleToggle(mod: TenantModule, newEnabled: boolean) {
    if (!newEnabled && CORE_MODULES.includes(mod.key)) {
      if (!window.confirm(`Disable core module "${mod.key}" for ${tenant.name}? This may break core CRM functionality.`)) return;
    }
    queryClient.setQueryData<TenantModule[]>(["tenant-modules", tenant.id], (old) =>
      old?.map((m) => (m.key === mod.key ? { ...m, enabled: newEnabled } : m))
    );
    toggleMutation.mutate({ key: mod.key, enabled: newEnabled });
  }

  const grouped = useMemo(() => {
    const map: Record<string, TenantModule[]> = {};
    for (const m of modules) {
      const cat = "module";
      if (!map[cat]) map[cat] = [];
      map[cat].push(m);
    }
    return modules;
  }, [modules]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{tenant.name}</span>
          <Badge variant={tenant.status === "active" ? "default" : "destructive"} className="text-xs">
            {tenant.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{tenant.userCount} user{tenant.userCount !== 1 ? "s" : ""}</span>
          <span>{(tenant as any).enabledModuleCount ?? "—"} modules on</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 p-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetConfirm(true)}
                  disabled={resetMutation.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset to defaults
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.map((mod) => (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between rounded border bg-card px-3 py-2"
                  >
                    <div className="min-w-0 mr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{mod.key}</span>
                        {mod.isOverride && (
                          <Badge variant="outline" className="text-xs px-1 py-0">custom</Badge>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={mod.enabled}
                      disabled={toggleMutation.isPending}
                      onCheckedChange={(v) => handleToggle(mod, v)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset modules for {tenant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All per-tenant module overrides will be replaced with the current global defaults.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setResetConfirm(false); resetMutation.mutate(); }}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Quick Overview Matrix ────────────────────────────────────────────────────

function OverviewMatrix({ tenants, globalModules }: { tenants: Tenant[]; globalModules: GlobalModule[] }) {
  const moduleKeys = globalModules.map((m) => m.key);

  const results = useQueries({
    queries: tenants.map((t) => ({
      queryKey: ["tenant-modules", t.id],
      queryFn: () => getTenantModules(t.id),
    })),
  });

  const tenantModuleMap = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    tenants.forEach((t, i) => {
      const mods = results[i]?.data ?? [];
      const modMap = new Map(mods.map((m) => [m.key, m.enabled]));
      map.set(t.id, modMap);
    });
    return map;
  }, [tenants, results]);

  if (tenants.length === 0) return <div className="text-sm text-muted-foreground p-4">No tenants yet.</div>;

  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left p-2 border bg-muted font-medium sticky left-0 z-10 min-w-[140px]">Module</th>
            {tenants.map((t) => (
              <th key={t.id} className="p-2 border bg-muted font-medium text-center min-w-[100px] truncate max-w-[120px]">
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {moduleKeys.map((key) => (
            <tr key={key} className="hover:bg-muted/30">
              <td className="p-2 border font-mono sticky left-0 bg-card z-10">{key}</td>
              {tenants.map((t) => {
                const enabled = tenantModuleMap.get(t.id)?.get(key);
                return (
                  <td key={t.id} className="p-2 border text-center">
                    {enabled === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : enabled ? (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Enabled" />
                    ) : (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/30" title="Disabled" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModuleControlCentrePage() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");

  if (!authLoading && !isSuperAdmin) return <Redirect to="/" />;

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: getTenants,
  });

  const { data: globalModules = [] } = useQuery({
    queryKey: ["global-modules"],
    queryFn: getGlobalModules,
  });

  const filteredTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          !search ||
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase())
      ),
    [tenants, search]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Module Control Centre</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage global module defaults and per-tenant overrides.
        </p>
      </div>

      <Tabs defaultValue="global">
        <TabsList>
          <TabsTrigger value="global">Global Defaults</TabsTrigger>
          <TabsTrigger value="tenants">Per-Tenant</TabsTrigger>
          <TabsTrigger value="overview">Quick Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Global Module Defaults</CardTitle>
              <p className="text-sm text-muted-foreground">
                These defaults apply to all tenants that have not set a per-tenant override.
                Changing a global default will affect all such tenants immediately.
              </p>
            </CardHeader>
            <CardContent>
              <GlobalModulesSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Tenant Module Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Click a tenant to expand and manage its module toggles. Modules marked{" "}
                <Badge variant="outline" className="text-xs px-1 py-0">custom</Badge> differ from the global default.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {tenantsLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tenants found.</div>
              ) : (
                <div className="space-y-2">
                  {filteredTenants.map((t) => (
                    <TenantModuleRow key={t.id} tenant={t} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Overview</CardTitle>
              <p className="text-sm text-muted-foreground">
                Modules down the side, tenants across the top.{" "}
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 align-middle" /> enabled,{" "}
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/30 align-middle" /> disabled.
              </p>
            </CardHeader>
            <CardContent>
              <OverviewMatrix tenants={tenants} globalModules={globalModules} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
