import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Zap, Clock, Server, Database, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface HealthSummary {
  systemStatus: "healthy" | "degraded" | "critical";
  statusReason: string;
  uptime: number;
  requestsLastHour: number;
  errorsLastHour: number;
  errorRate: number;
  p95ResponseMs: number;
  activeSessions: number;
  remediationRunsToday: number;
  autoFixedToday: number;
  activeTenantsToday: number;
  dbConnectionsOk: boolean;
}

interface ErrorLog {
  id: string;
  message: string;
  level: string;
  route: string | null;
  stack: string | null;
  plainEnglish: string | null;
  resolved: boolean;
  occurrenceCount: number;
  lastOccurredAt: string | null;
  createdAt: string;
  statusCode: number | null;
  metadata: Record<string, any> | null;
}

interface RequestBucket {
  minute: string;
  total: number;
  errors: number;
  avgDurationMs: number;
}

interface ModuleStatus {
  moduleKey: string;
  requestsToday: number;
  errorsToday: number;
  errorRate: number;
  lastErrorAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusBadge({ status }: { status: "healthy" | "degraded" | "critical" }) {
  if (status === "healthy") return <Badge className="bg-green-500 text-white">Healthy</Badge>;
  if (status === "degraded") return <Badge className="bg-yellow-500 text-white">Degraded</Badge>;
  return <Badge className="bg-red-500 text-white">Critical</Badge>;
}

function StatusIcon({ status }: { status: "healthy" | "degraded" | "critical" }) {
  if (status === "healthy") return <CheckCircle2 className="h-8 w-8 text-green-500" />;
  if (status === "degraded") return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
  return <XCircle className="h-8 w-8 text-red-500" />;
}

function moduleErrorClass(rate: number) {
  if (rate > 5) return "border-red-400 bg-red-50 dark:bg-red-950";
  if (rate > 1) return "border-yellow-400 bg-yellow-50 dark:bg-yellow-950";
  return "border-green-300 bg-green-50 dark:bg-green-950";
}

function moduleStatusDot(rate: number) {
  if (rate > 5) return "bg-red-500";
  if (rate > 1) return "bg-yellow-500";
  return "bg-green-500";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function HealthDashboardPage() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  const [requestBuckets, setRequestBuckets] = useState<RequestBucket[]>([]);
  const [statusFilter, setStatusFilter] = useState("new");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [runningRemediation, setRunningRemediation] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(30);
  const wsRef = useRef<WebSocket | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get<HealthSummary>("/super-admin/health/summary");
      setSummary(data);
      setLastChecked(new Date());
      setCountdown(30);
    } catch {
      toast({ title: "Failed to load health summary", variant: "destructive" });
    }
  }, [toast]);

  const fetchErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50", page: "1" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (moduleFilter) params.set("module", moduleFilter);
      const data = await api.get<{ errors: ErrorLog[] }>(`/super-admin/health/errors?${params}`);
      setErrors(data.errors);
    } catch {
      toast({ title: "Failed to load errors", variant: "destructive" });
    }
  }, [statusFilter, moduleFilter, toast]);

  const fetchModules = useCallback(async () => {
    try {
      const data = await api.get<{ modules: ModuleStatus[] }>("/super-admin/health/module-status");
      setModules(data.modules);
    } catch {
      // non-critical
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await api.get<{ buckets: RequestBucket[] }>("/super-admin/health/requests?minutes=60");
      setRequestBuckets(data.buckets);
    } catch {
      // non-critical
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchSummary();
    fetchErrors();
    fetchModules();
    fetchRequests();
  }, [fetchSummary, fetchErrors, fetchModules, fetchRequests]);

  // Initial load
  useEffect(() => {
    if (!authLoading && isSuperAdmin) refreshAll();
  }, [authLoading, isSuperAdmin, refreshAll]);

  // Re-fetch errors when filter changes
  useEffect(() => {
    if (!authLoading && isSuperAdmin) fetchErrors();
  }, [statusFilter, moduleFilter, fetchErrors, authLoading, isSuperAdmin]);

  // Countdown timer — refreshes all data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { refreshAll(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  // WebSocket
  useEffect(() => {
    if (!isSuperAdmin) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/health`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "health_summary") {
          setSummary((prev) => prev ? { ...prev, ...msg.data } : msg.data);
          setLastChecked(new Date());
          setCountdown(30);
        } else if (msg.type === "new_error") {
          setErrors((prev) => [msg.data, ...prev].slice(0, 50));
        }
      } catch {
        // ignore malformed
      }
    };

    return () => ws.close();
  }, [isSuperAdmin]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const explainError = async (errorId: string) => {
    setExplaining(errorId);
    try {
      const data = await api.post<{ explanation: string }>(`/super-admin/health/errors/${errorId}/explain`, {});
      setErrors((prev) =>
        prev.map((e) => e.id === errorId ? { ...e, plainEnglish: data.explanation } : e)
      );
      setExpandedError(errorId);
    } catch {
      toast({ title: "AI explain failed", variant: "destructive" });
    } finally {
      setExplaining(null);
    }
  };

  const updateErrorStatus = async (errorId: string, status: string) => {
    setUpdatingStatus(errorId);
    try {
      await api.post(`/super-admin/health/errors/${errorId}/status`, { status });
      setErrors((prev) =>
        prev.map((e) => e.id === errorId ? { ...e, resolved: status === "fixed" || status === "ignored" } : e)
      );
      toast({ title: `Error marked as ${status}` });
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const runRemediation = async () => {
    setRunningRemediation(true);
    try {
      const data = await api.post<{ ran: number; results: any[] }>("/super-admin/health/remediation/run", {});
      toast({ title: `Auto-fix ran ${data.ran} policies` });
      refreshAll();
    } catch {
      toast({ title: "Remediation failed", variant: "destructive" });
    } finally {
      setRunningRemediation(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------
  if (!authLoading && !isSuperAdmin) return <Redirect to="/" />;
  if (authLoading || !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusBg =
    summary.systemStatus === "healthy" ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
    summary.systemStatus === "degraded" ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800" :
    "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";

  const filteredErrors = moduleFilter
    ? errors.filter((e) => (e.metadata as any)?.module === moduleFilter || e.route?.includes(moduleFilter))
    : errors;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ROW 1 — Status Banner */}
      <div className={`rounded-xl border-2 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${statusBg}`}>
        <div className="flex items-center gap-4">
          <StatusIcon status={summary.systemStatus} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">
                {summary.systemStatus === "healthy" ? "All Systems Healthy" :
                 summary.systemStatus === "degraded" ? "System Degraded" : "Critical Issue Detected"}
              </h1>
              <StatusBadge status={summary.systemStatus} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{summary.statusReason}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Uptime: {formatUptime(summary.uptime)} · Last checked: {countdown}s ago
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={runRemediation} disabled={runningRemediation}>
            <Zap className="h-4 w-4 mr-1" />
            {runningRemediation ? "Running…" : "Run Auto-Fix"}
          </Button>
        </div>
      </div>

      {/* ROW 2 — 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Requests/hr
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.requestsLastHour.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className={summary.errorRate > 2 ? "border-red-400" : ""}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${summary.errorRate > 2 ? "text-red-500" : ""}`}>
              {summary.errorRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> P95 Response
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${summary.p95ResponseMs > 1000 ? "text-yellow-500" : ""}`}>
              {summary.p95ResponseMs}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.activeSessions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" /> Auto-Fixed Today
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.autoFixedToday}</p>
          </CardContent>
        </Card>

        <Card className={!summary.dbConnectionsOk ? "border-red-400" : ""}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Database
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${summary.dbConnectionsOk ? "text-green-500" : "text-red-500"}`}>
              {summary.dbConnectionsOk ? "OK" : "DOWN"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — Request chart (simple bar representation) */}
      {requestBuckets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Request Volume — Last 60 Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-0.5 h-20 overflow-hidden">
              {requestBuckets.slice(-60).map((b, i) => {
                const maxTotal = Math.max(...requestBuckets.map((x) => x.total), 1);
                const heightPct = Math.round((b.total / maxTotal) * 100);
                const hasErrors = b.errors > 0;
                return (
                  <div
                    key={i}
                    title={`${b.minute}: ${b.total} req, ${b.errors} err`}
                    className={`flex-1 min-w-0 rounded-t ${hasErrors ? "bg-red-400" : "bg-blue-400"}`}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  />
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Blue = normal · Red = errors present</p>
          </CardContent>
        </Card>
      )}

      {/* ROW 4 — Recent Errors Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Errors</CardTitle>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            {moduleFilter && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setModuleFilter(null)}>
                Clear filter: {moduleFilter}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Severity</TableHead>
                <TableHead>Error Message</TableHead>
                <TableHead className="w-32">Route</TableHead>
                <TableHead className="w-28">First Seen</TableHead>
                <TableHead className="w-16">Count</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredErrors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No errors found
                  </TableCell>
                </TableRow>
              )}
              {filteredErrors.map((error) => {
                const rowBg =
                  error.level === "error" || error.level === "fatal"
                    ? "bg-red-50 dark:bg-red-950/30"
                    : error.level === "warn"
                    ? "bg-yellow-50 dark:bg-yellow-950/30"
                    : "bg-blue-50 dark:bg-blue-950/30";
                const isExpanded = expandedError === error.id;

                return (
                  <>
                    <TableRow key={error.id} className={rowBg}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            error.level === "error" || error.level === "fatal"
                              ? "border-red-400 text-red-600"
                              : error.level === "warn"
                              ? "border-yellow-400 text-yellow-600"
                              : "border-blue-400 text-blue-600"
                          }
                        >
                          {error.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-sm font-medium">{error.message}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[8rem]">
                        {error.route ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{error.occurrenceCount}</TableCell>
                      <TableCell>
                        {error.resolved ? (
                          <Badge variant="outline" className="border-green-400 text-green-600">resolved</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-400 text-red-600">open</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={explaining === error.id}
                            onClick={() => explainError(error.id)}
                          >
                            {explaining === error.id ? "…" : "Explain (AI)"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => setExpandedError(isExpanded ? null : error.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                          {!error.resolved && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-2 text-green-600"
                                disabled={updatingStatus === error.id}
                                onClick={() => updateErrorStatus(error.id, "fixed")}
                              >
                                Fixed
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-2 text-muted-foreground"
                                disabled={updatingStatus === error.id}
                                onClick={() => updateErrorStatus(error.id, "ignored")}
                              >
                                Ignore
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${error.id}-detail`} className={rowBg}>
                        <TableCell colSpan={7} className="pb-4">
                          <div className="space-y-3 pl-2">
                            {error.plainEnglish && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 p-4">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">AI Explanation</p>
                                <p className="text-sm whitespace-pre-wrap">{error.plainEnglish}</p>
                              </div>
                            )}
                            {error.stack && (
                              <div className="rounded-lg border bg-muted p-3">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Stack Trace</p>
                                <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">{error.stack}</pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ROW 5 — Module Health Grid */}
      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Module Health</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {modules.map((mod) => (
            <button
              key={mod.moduleKey}
              onClick={() => setModuleFilter(moduleFilter === mod.moduleKey ? null : mod.moduleKey)}
              className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${moduleErrorClass(mod.errorRate)} ${moduleFilter === mod.moduleKey ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold truncate">{mod.moduleKey}</span>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${moduleStatusDot(mod.errorRate)}`} />
              </div>
              <p className="text-xs text-muted-foreground">{mod.requestsToday} req</p>
              <p className="text-xs text-muted-foreground">{mod.errorsToday} err ({mod.errorRate.toFixed(1)}%)</p>
            </button>
          ))}
          {modules.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No module data for today yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
