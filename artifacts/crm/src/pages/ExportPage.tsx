import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Package, LayoutGrid, ArrowRightLeft, Clock, CheckCircle, XCircle, Loader2, FileText, Users, Building2, Activity, StickyNote, CheckSquare, Megaphone, Handshake, GraduationCap, UserCheck, TrendingUp, LifeBuoy, BookOpen, UsersRound, Target, Paperclip, Zap, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ExportJob {
  id: string;
  exportType: string;
  format: string;
  status: "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";
  totalRows: number | null;
  fileSize: number | null;
  expiresAt: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface DownloadLink {
  token: string;
  expiresAt: string | null;
}

const MODULE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  contacts:        { label: "Contacts",        icon: <Users className="w-4 h-4" /> },
  organizations:   { label: "Organisations",   icon: <Building2 className="w-4 h-4" /> },
  activities:      { label: "Activities",      icon: <Activity className="w-4 h-4" /> },
  notes:           { label: "Notes",           icon: <StickyNote className="w-4 h-4" /> },
  tasks:           { label: "Tasks",           icon: <CheckSquare className="w-4 h-4" /> },
  campaigns:       { label: "Campaigns",       icon: <Megaphone className="w-4 h-4" /> },
  funders:         { label: "Funders",         icon: <Handshake className="w-4 h-4" /> },
  volunteers:      { label: "Volunteers",      icon: <UserCheck className="w-4 h-4" /> },
  students:        { label: "Students",        icon: <GraduationCap className="w-4 h-4" /> },
  opportunities:   { label: "Pipeline",        icon: <TrendingUp className="w-4 h-4" /> },
  support_tickets: { label: "Support Tickets", icon: <LifeBuoy className="w-4 h-4" /> },
  programmes:      { label: "Programmes",      icon: <BookOpen className="w-4 h-4" /> },
  cohorts:         { label: "Cohorts",         icon: <UsersRound className="w-4 h-4" /> },
  outcomes:        { label: "Outcomes",        icon: <Target className="w-4 h-4" /> },
  attachments:     { label: "Attachments",     icon: <Paperclip className="w-4 h-4" /> },
  automation_rules:{ label: "Automation",      icon: <Zap className="w-4 h-4" /> },
  saved_reports:   { label: "Reports",         icon: <BarChart3 className="w-4 h-4" /> },
};

const MODULES = Object.keys(MODULE_META);

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: ExportJob["status"] }) {
  if (status === "COMPLETE") return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
  if (status === "FAILED") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
  if (status === "PROCESSING") return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
  return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

export default function ExportPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [activeEntityExports, setActiveEntityExports] = useState<Record<string, string>>({});

  if (!isAdmin) return <Redirect to="/" />;

  const { data: history = [] } = useQuery<ExportJob[]>({
    queryKey: ["export-history"],
    queryFn: () => api.get<ExportJob[]>("/export/history"),
    refetchInterval: pollingJobId ? 3000 : false,
  });

  const { data: counts = {} } = useQuery<Record<string, number>>({
    queryKey: ["export-counts"],
    queryFn: () => api.get<Record<string, number>>("/export/counts"),
  });

  useEffect(() => {
    if (!pollingJobId) return;
    const job = history.find((j) => j.id === pollingJobId);
    if (job && (job.status === "COMPLETE" || job.status === "FAILED")) {
      setPollingJobId(null);
      setActiveEntityExports((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === pollingJobId) delete next[k];
        }
        return next;
      });
      if (job.status === "COMPLETE") {
        toast({ title: "Export ready", description: "Your export is ready to download." });
      } else {
        toast({ title: "Export failed", description: job.error ?? "Unknown error", variant: "destructive" });
      }
    }
  }, [history, pollingJobId]);

  const fullExportMutation = useMutation({
    mutationFn: () => api.post<{ jobId: string }>("/export/full"),
    onSuccess: ({ jobId }) => {
      setPollingJobId(jobId);
      queryClient.invalidateQueries({ queryKey: ["export-history"] });
      toast({ title: "Export started", description: "Your full data export is being prepared." });
    },
    onError: () => toast({ title: "Failed to start export", variant: "destructive" }),
  });

  const entityExportMutation = useMutation({
    mutationFn: async ({ entityType, format }: { entityType: string; format: string }) => {
      const res = await fetch("/api/export/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ entityType, format }),
      });
      if (!res.ok) throw new Error("Export failed");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const isFileDownload = disposition.includes("attachment");
      if (!isFileDownload) {
        // Background job response
        return { type: "job" as const, data: await res.json() as { jobId: string } };
      }
      // File response — trigger browser download
      const blob = await res.blob();
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${entityType}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { type: "download" as const };
    },
    onSuccess: (result, { entityType, format }) => {
      if (result.type === "job") {
        setPollingJobId(result.data.jobId);
        setActiveEntityExports((prev) => ({ ...prev, [`${entityType}-${format}`]: result.data.jobId }));
        queryClient.invalidateQueries({ queryKey: ["export-history"] });
        toast({ title: "Export started", description: `Exporting ${entityType} as ${format.toUpperCase()}.` });
      } else {
        toast({ title: "Download started", description: `${entityType} exported as ${format.toUpperCase()}.` });
      }
    },
    onError: () => toast({ title: "Failed to start export", variant: "destructive" }),
  });

  const handleEntityExport = (entityType: string, format: string) => {
    const key = `${entityType}-${format}`;
    if (activeEntityExports[key] || entityExportMutation.isPending) return;
    entityExportMutation.mutate({ entityType, format });
  };

  const handleDownload = async (job: ExportJob) => {
    try {
      const { token } = await api.get<DownloadLink>(`/export/download-link/${job.id}`);
      window.location.href = `/api/export/download/${job.id}?token=${token}`;
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const isFullRunning = fullExportMutation.isPending || (!!pollingJobId && history.find(j => j.id === pollingJobId)?.exportType === "full");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data Export</h1>
        <p className="text-muted-foreground mt-1">Export your CRM data for backup, migration, or reporting.</p>
      </div>

      {/* Card 1: Full Data Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <CardTitle>Full Data Export</CardTitle>
          </div>
          <CardDescription>
            Download all your data as a ZIP file. Includes all contacts, organisations, deals,
            activities, notes, tasks, and more in CSV and JSON formats. Safeguarding records are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button onClick={() => fullExportMutation.mutate()} disabled={!!isFullRunning}>
              {isFullRunning
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Preparing…</>
                : <><Download className="w-4 h-4 mr-2" />Request Export</>}
            </Button>
            <span className="text-sm text-muted-foreground">
              Includes CSV + JSON for every module · Excludes safeguarding notes
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Export by Module */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <CardTitle>Export by Module</CardTitle>
          </div>
          <CardDescription>
            Export a single module. Files under 5,000 rows download immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map((entity) => {
              const meta = MODULE_META[entity];
              const csvKey = `${entity}-csv`;
              const jsonKey = `${entity}-json`;
              const xlsxKey = `${entity}-xlsx`;
              const isBusy = (k: string) => !!activeEntityExports[k] || entityExportMutation.isPending;
              return (
                <div key={entity} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{meta.icon}</span>
                    <span className="font-medium text-sm">{meta.label}</span>
                    {counts[entity] !== undefined && (
                      <Badge variant="secondary" className="ml-auto text-xs">{counts[entity].toLocaleString()}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" disabled={isBusy(csvKey)} onClick={() => handleEntityExport(entity, "csv")}>
                      {activeEntityExports[csvKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><FileText className="w-3 h-3 mr-1" />CSV</>}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" disabled={isBusy(jsonKey)} onClick={() => handleEntityExport(entity, "json")}>
                      {activeEntityExports[jsonKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><FileText className="w-3 h-3 mr-1" />JSON</>}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" disabled={isBusy(xlsxKey)} onClick={() => handleEntityExport(entity, "xlsx")}>
                      {activeEntityExports[xlsxKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><FileText className="w-3 h-3 mr-1" />XLSX</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Moving to Another Platform */}
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">Moving to Another Platform?</CardTitle>
          </div>
          <CardDescription className="space-y-1">
            <p>Use the full export to migrate your data. The ZIP includes a <code>schema.json</code> that
            describes every field and a <code>README.md</code> with plain-English instructions.</p>
            <p className="mt-2 text-amber-700 dark:text-amber-400 font-medium">
              Safeguarding records are handled separately under data protection law. Contact your
              Data Protection Officer or system administrator for a compliant export of these records.
            </p>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Export history */}
      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Export History</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="capitalize">{job.exportType === "full" ? "Full export" : job.exportType}</TableCell>
                  <TableCell className="uppercase text-xs">{job.format}</TableCell>
                  <TableCell><StatusBadge status={job.status} /></TableCell>
                  <TableCell>{job.totalRows ?? "—"}</TableCell>
                  <TableCell>{formatBytes(job.fileSize)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {job.status === "COMPLETE" && (
                      <Button size="sm" variant="outline" onClick={() => handleDownload(job)}>
                        <Download className="w-3 h-3 mr-1" />Download
                      </Button>
                    )}
                    {job.status === "FAILED" && (
                      <span className="text-xs text-destructive">{job.error}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
