import { useEffect, useState, useCallback } from "react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  getReportTypes, executeReport, getSavedReports, createSavedReport, deleteSavedReport,
  getReportSchedules, createReportSchedule, updateReportSchedule, deleteReportSchedule,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart2, Download, Loader2, Play, Save, Trash2, Clock, Plus,
  FileText, Users, TrendingUp, Activity, Target, Heart, Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReportType {
  id: string;
  entityType: string;
  label: string;
  description?: string;
  availableFields: string[];
  availableFilters: string[];
  availableGroupings: string[];
}

interface SavedReport {
  id: string;
  name: string;
  reportTypeId: string | null;
  columns: string[];
  filters: any[];
  chartType: string | null;
  sharing: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportSchedule {
  id: string;
  savedReportId: string;
  frequency: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
}

const REPORT_ICONS: Record<string, React.ElementType> = {
  rpt_org_summary: Users,
  rpt_contact_activity: Activity,
  rpt_programme_delivery: Target,
  rpt_volunteer_pipeline: Heart,
  rpt_funding_pipeline: TrendingUp,
  rpt_lead_velocity: TrendingUp,
  rpt_contacts_no_activity: Users,
  rpt_campaign_roi: BarChart2,
  rpt_outcome_summary: Target,
  rpt_win_rate_by_source: TrendingUp,
  rpt_rep_leaderboard: Users,
};

const DATE_PRESETS = [
  { label: "This week", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "This quarter", days: 90 },
  { label: "This year", days: 365 },
  { label: "All time", days: 0 },
];

const CHART_TYPES = ["table", "bar", "line", "pie", "number"];

export default function ReportsPage() {
  useEffect(() => { logUserAction("page_view", { page: "ReportsPage" }); }, []);

  const { isManager } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pre-built");

  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const [builderStep, setBuilderStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [selectedGroupBy, setSelectedGroupBy] = useState<string>("");
  const [selectedChartType, setSelectedChartType] = useState("table");
  const [datePreset, setDatePreset] = useState(30);
  const [reportName, setReportName] = useState("");
  const [builderResults, setBuilderResults] = useState<any[] | null>(null);
  const [runningReport, setRunningReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleTargetId, setScheduleTargetId] = useState<string>("");
  const [scheduleFreq, setScheduleFreq] = useState("weekly");
  const [schedulingInProgress, setSchedulingInProgress] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const data = await getReportTypes();
      setReportTypes(data.data || []);
    } catch { toast({ title: "Failed to load report types", variant: "destructive" }); }
    finally { setLoadingTypes(false); }
  }, [toast]);

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const data = await getSavedReports();
      setSavedReports(data.data || []);
    } catch { /* non-critical */ }
    finally { setLoadingSaved(false); }
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const data = await getReportSchedules();
      setSchedules(data.data || []);
    } catch { /* non-critical */ }
    finally { setLoadingSchedules(false); }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => {
    if (activeTab === "saved") loadSaved();
    if (activeTab === "schedules") { loadSaved(); loadSchedules(); }
  }, [activeTab, loadSaved, loadSchedules]);

  const selectPreBuilt = (rt: ReportType) => {
    setSelectedType(rt);
    setSelectedColumns(rt.availableFields.slice(0, 6));
    setSelectedGroupBy(rt.availableGroupings[0] || "");
    setReportName(rt.label);
    setBuilderStep(2);
    setBuilderResults(null);
    setActiveTab("builder");
  };

  const runBuilderReport = async () => {
    if (!selectedType) return;
    setRunningReport(true);
    setBuilderResults(null);
    try {
      const filters: any[] = [];
      if (datePreset > 0) {
        const since = new Date(Date.now() - datePreset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        filters.push({ field: "createdAt", operator: "date_range", value: { start: since } });
      }
      const result = await executeReport({
        reportTypeId: selectedType.id,
        columns: selectedColumns,
        filters,
        groupings: selectedGroupBy ? [selectedGroupBy] : [],
        sortOrder: [],
        chartType: selectedChartType,
        limit: 100,
        page: 1,
      });
      setBuilderResults(result.data || []);
      setBuilderStep(4);
    } catch { toast({ title: "Failed to run report", variant: "destructive" }); }
    finally { setRunningReport(false); }
  };

  const saveBuilderReport = async () => {
    if (!selectedType || !reportName.trim()) { toast({ title: "Enter a report name", variant: "destructive" }); return; }
    setSavingReport(true);
    try {
      const filters: any[] = [];
      if (datePreset > 0) {
        const since = new Date(Date.now() - datePreset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        filters.push({ field: "createdAt", operator: "date_range", value: { start: since } });
      }
      await createSavedReport({
        reportTypeId: selectedType.id,
        name: reportName.trim(),
        columns: selectedColumns,
        filters,
        groupings: selectedGroupBy ? [selectedGroupBy] : [],
        sortOrder: [],
        chartType: selectedChartType,
        sharing: "PRIVATE",
      });
      toast({ title: "Report saved" });
      loadSaved();
    } catch { toast({ title: "Failed to save report", variant: "destructive" }); }
    finally { setSavingReport(false); }
  };

  const downloadCsv = async (report: SavedReport) => {
    setDownloadingId(report.id);
    try {
      const res = await fetch(`/api/reports/saved/${report.id}/export/csv`, {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast({ title: "CSV export failed", variant: "destructive" }); }
    finally { setDownloadingId(null); }
  };

  const deleteReport = async (id: string) => {
    try {
      await deleteSavedReport(id);
      setSavedReports((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Report deleted" });
    } catch { toast({ title: "Failed to delete report", variant: "destructive" }); }
  };

  const scheduleReport = async () => {
    if (!scheduleTargetId) return;
    setSchedulingInProgress(true);
    try {
      await createReportSchedule({ savedReportId: scheduleTargetId, frequency: scheduleFreq });
      toast({ title: `Report scheduled (${scheduleFreq})` });
      loadSchedules();
    } catch { toast({ title: "Failed to schedule report", variant: "destructive" }); }
    finally { setSchedulingInProgress(false); }
  };

  const toggleSchedule = async (schedule: ReportSchedule) => {
    try {
      await updateReportSchedule(schedule.id, { enabled: !schedule.enabled });
      setSchedules((prev) => prev.map((s) => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s));
    } catch { toast({ title: "Failed to update schedule", variant: "destructive" }); }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await deleteReportSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Schedule deleted" });
    } catch { toast({ title: "Failed to delete schedule", variant: "destructive" }); }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Pre-built reports, custom builder, and scheduled delivery</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pre-built">Pre-built</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        {/* Pre-built */}
        <TabsContent value="pre-built" className="space-y-4">
          <p className="text-sm text-muted-foreground">Click any report to open it in the builder.</p>
          {loadingTypes ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportTypes.map((rt) => {
                const Icon = REPORT_ICONS[rt.id] || FileText;
                return (
                  <Card key={rt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectPreBuilt(rt)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                        <CardTitle className="text-sm">{rt.label}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{rt.description || `${rt.entityType} report`}</p>
                      <Badge variant="outline" className="mt-2 text-xs">{rt.entityType}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Builder */}
        <TabsContent value="builder" className="space-y-6">
          <div className="flex items-center gap-2 text-sm">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${builderStep >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
                <span className={builderStep >= s ? "text-foreground" : "text-muted-foreground"}>
                  {s === 1 ? "Choose type" : s === 2 ? "Select fields" : s === 3 ? "Configure" : "Results"}
                </span>
                {s < 4 && <span className="text-muted-foreground mx-1">›</span>}
              </div>
            ))}
          </div>

          {builderStep === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select a report type, or pick a pre-built template from the Pre-built tab.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {reportTypes.map((rt) => (
                  <button key={rt.id} onClick={() => { setSelectedType(rt); setSelectedColumns(rt.availableFields.slice(0, 6)); setSelectedGroupBy(rt.availableGroupings[0] || ""); setReportName(rt.label); setBuilderStep(2); }}
                    className="text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors">
                    <p className="text-sm font-medium">{rt.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{rt.entityType}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {builderStep === 2 && selectedType && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Report name</Label>
                <Input value={reportName} onChange={(e) => setReportName(e.target.value)} className="mt-1 max-w-sm" placeholder="My report" />
              </div>
              <div>
                <Label className="text-sm font-medium">Columns to include</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedType.availableFields.map((f) => (
                    <button key={f} onClick={() => setSelectedColumns((prev) => prev.includes(f) ? prev.filter((c) => c !== f) : [...prev, f])}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${selectedColumns.includes(f) ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:border-primary"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => setBuilderStep(3)} disabled={selectedColumns.length === 0}>Next: Configure →</Button>
            </div>
          )}

          {builderStep === 3 && selectedType && (
            <div className="space-y-4 max-w-md">
              <div>
                <Label className="text-sm font-medium">Date range</Label>
                <Select value={String(datePreset)} onValueChange={(v) => setDatePreset(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map((p) => <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedType.availableGroupings.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Group by</Label>
                  <Select value={selectedGroupBy} onValueChange={setSelectedGroupBy}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="No grouping" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No grouping</SelectItem>
                      {selectedType.availableGroupings.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Chart type</Label>
                <Select value={selectedChartType} onValueChange={setSelectedChartType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHART_TYPES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBuilderStep(2)}>← Back</Button>
                <Button onClick={runBuilderReport} disabled={runningReport}>
                  {runningReport ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : <><Play className="h-4 w-4 mr-2" />Run Report</>}
                </Button>
              </div>
            </div>
          )}

          {builderStep === 4 && builderResults !== null && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{builderResults.length} rows returned</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBuilderStep(3)}>← Edit</Button>
                  <Button size="sm" onClick={saveBuilderReport} disabled={savingReport}>
                    {savingReport ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Report
                  </Button>
                </div>
              </div>
              {builderResults.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No data found for the selected filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {selectedGroupBy
                          ? [selectedGroupBy, "count"].map((col) => <TableHead key={col} className="text-xs">{col}</TableHead>)
                          : selectedColumns.map((col) => <TableHead key={col} className="text-xs">{col}</TableHead>)
                        }
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {builderResults.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          {(selectedGroupBy ? [selectedGroupBy, "count"] : selectedColumns).map((col) => (
                            <TableCell key={col} className="text-xs max-w-[200px] truncate">{row[col] != null ? String(row[col]) : "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {builderResults.length > 50 && <p className="text-xs text-muted-foreground p-3">Showing first 50 of {builderResults.length} rows. Save and export CSV for full data.</p>}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Saved */}
        <TabsContent value="saved" className="space-y-4">
          {loadingSaved ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
          ) : savedReports.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No saved reports yet</p>
              <p className="text-sm mt-1">Build a report and save it to see it here.</p>
              <Button className="mt-4" variant="outline" onClick={() => setActiveTab("builder")}>
                <Plus className="h-4 w-4 mr-2" />Open Builder
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sharing</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{report.sharing}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(report.updatedAt), { addSuffix: true })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={downloadingId === report.id} onClick={() => downloadCsv(report)}>
                          {downloadingId === report.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteReport(report.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Schedules */}
        <TabsContent value="schedules" className="space-y-6">
          {savedReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Schedule a Report</CardTitle>
                <CardDescription>Send a saved report by email on a recurring schedule.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs">Saved report</Label>
                    <Select value={scheduleTargetId} onValueChange={setScheduleTargetId}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select report…" /></SelectTrigger>
                      <SelectContent>
                        {savedReports.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Frequency</Label>
                    <Select value={scheduleFreq} onValueChange={setScheduleFreq}>
                      <SelectTrigger className="mt-1 h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" className="h-8" disabled={!scheduleTargetId || schedulingInProgress} onClick={scheduleReport}>
                    {schedulingInProgress ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Calendar className="h-3 w-3 mr-1" />}
                    Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingSchedules ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No scheduled reports</p>
              <p className="text-sm mt-1">Save a report first, then schedule it above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const report = savedReports.find((r) => r.id === s.savedReportId);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{report?.name ?? s.savedReportId}</TableCell>
                      <TableCell className="text-sm capitalize">{s.frequency}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(s.nextRunAt), { addSuffix: true })}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.lastRunAt ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true }) : "Never"}</TableCell>
                      <TableCell><Badge variant={s.enabled ? "default" : "outline"} className="text-xs">{s.enabled ? "Active" : "Paused"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleSchedule(s)}>{s.enabled ? "Pause" : "Resume"}</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteSchedule(s.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
