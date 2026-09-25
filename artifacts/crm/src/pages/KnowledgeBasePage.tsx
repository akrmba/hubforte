import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, RefreshCw, Share2, Edit2, Download, Plus, CheckCircle, AlertTriangle, HelpCircle, Wrench, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface KBEntry {
  id: string;
  errorPattern: string;
  plainEnglish: string | null;
  fixSteps: string | null;
  status: string;
  module: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  autoFixed: string | null;
  shareToken: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "needs_investigation", label: "Needs Investigation" },
  { value: "known_issue", label: "Known Issue" },
  { value: "fixed", label: "Fixed" },
  { value: "working_as_expected", label: "Working as Expected" },
];

function statusBadge(status: string) {
  if (status === "fixed") return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Fixed</Badge>;
  if (status === "known_issue") return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Known Issue</Badge>;
  if (status === "working_as_expected") return <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" />Working as Expected</Badge>;
  return <Badge variant="destructive"><HelpCircle className="h-3 w-3 mr-1" />Needs Investigation</Badge>;
}

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<KBEntry | null>(null);
  const [editPlainEnglish, setEditPlainEnglish] = useState("");
  const [editFixSteps, setEditFixSteps] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [shareResult, setShareResult] = useState<{ shareUrl: string } | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ data: KBEntry[]; total: number }>({
    queryKey: ["knowledge-base", search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      return api.get(`/super-admin/knowledge-base?${params}`);
    },
  });

  const entries = data?.data ?? [];

  const syncMutation = useMutation({
    mutationFn: () => api.post("/super-admin/knowledge-base/sync-from-logs", {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      toast({ title: `Synced: ${res.created} new, ${res.updated} updated` });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; plainEnglish: string; fixSteps: string; status: string }) =>
      api.patch(`/super-admin/knowledge-base/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      setEditEntry(null);
      toast({ title: "Entry updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/super-admin/knowledge-base/${id}/generate-explanation`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      toast({ title: "AI explanation generated" });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/super-admin/knowledge-base/${id}/share`, {}),
    onSuccess: (res) => setShareResult({ shareUrl: res.shareUrl }),
    onError: (err: any) => toast({ title: "Share failed", description: err.message, variant: "destructive" }),
  });

  const createTaskMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/super-admin/knowledge-base/${id}/create-task`, {}),
    onSuccess: (res: any) => toast({ title: `Task created: ${res.title}` }),
    onError: (err: any) => toast({ title: "Task creation failed", description: err.message, variant: "destructive" }),
  });

  function openEdit(entry: KBEntry) {
    setEditEntry(entry);
    setEditPlainEnglish(entry.plainEnglish || "");
    setEditFixSteps(entry.fixSteps || "");
    setEditStatus(entry.status);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6" /> Error Knowledge Base</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Searchable database of all errors with AI explanations and fix steps. Share with developers safely.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync from Logs
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/super-admin/knowledge-base/export?format=csv" download>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/super-admin/knowledge-base/export?format=markdown" download>
              <Download className="h-4 w-4 mr-1" /> Export MD
            </a>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search errors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No entries found. Click "Sync from Logs" to populate the knowledge base.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <Card key={entry.id} className="overflow-hidden">
                <div
                  className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(entry.status)}
                      {entry.module && <Badge variant="outline" className="text-xs">{entry.module}</Badge>}
                      <span className="text-xs text-muted-foreground">{entry.occurrenceCount}× · Last {format(new Date(entry.lastSeenAt), "dd MMM yyyy")}</span>
                    </div>
                    <p className="font-mono text-sm mt-1 truncate">{entry.errorPattern}</p>
                    {entry.plainEnglish && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{entry.plainEnglish}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Plain English</h4>
                        <p className="text-sm">{entry.plainEnglish || <span className="italic text-muted-foreground">Not yet explained</span>}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Fix Steps</h4>
                        <p className="text-sm whitespace-pre-wrap">{entry.fixSteps || <span className="italic text-muted-foreground">Not yet documented</span>}</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      First seen: {format(new Date(entry.firstSeenAt), "dd MMM yyyy HH:mm")} ·
                      Auto-fixed: {entry.autoFixed === "yes" ? "Yes" : "No"}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(entry)}>
                        <Edit2 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => generateMutation.mutate(entry.id)} disabled={generateMutation.isPending}>
                        <Sparkles className="h-3 w-3 mr-1" /> Generate AI Explanation
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => shareMutation.mutate(entry.id)}>
                        <Share2 className="h-3 w-3 mr-1" /> Share with Developer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createTaskMutation.mutate(entry.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Create Task
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => { if (!o) setEditEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Knowledge Base Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.filter((o) => o.value).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Plain English Explanation</Label>
              <Textarea rows={3} value={editPlainEnglish} onChange={(e) => setEditPlainEnglish(e.target.value)} placeholder="Explain what this error means in plain English…" />
            </div>
            <div className="space-y-1">
              <Label>Fix Steps</Label>
              <Textarea rows={4} value={editFixSteps} onChange={(e) => setEditFixSteps(e.target.value)} placeholder="Step-by-step instructions for a developer to fix this…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button
              onClick={() => editEntry && updateMutation.mutate({ id: editEntry.id, plainEnglish: editPlainEnglish, fixSteps: editFixSteps, status: editStatus })}
              disabled={updateMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share result dialog */}
      <Dialog open={!!shareResult} onOpenChange={(o) => { if (!o) { setShareResult(null); setCopiedShare(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Share with Developer</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Send this link to a user with the DEVELOPER or PLATFORM_BUILDER role. They will see the error details and fix steps — no client data is exposed.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={shareResult?.shareUrl || ""} className="text-xs font-mono" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(shareResult?.shareUrl || ""); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            {copiedShare && <p className="text-xs text-green-600">Copied!</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => { setShareResult(null); setCopiedShare(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
