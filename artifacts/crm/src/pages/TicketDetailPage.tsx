import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft,
  User,
  MessageSquare,
  Send,
  Sparkles,
  MoreVertical,
  CheckCircle,
  XCircle,
  Calendar,
  Building2,
  Phone,
  Mail,
  Edit2,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation, useRoute } from "wouter";
import { Progress } from "@/components/ui/progress";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

type TicketUpdate = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
};

type AIDiagnosis = {
  id: string;
  diagnosis: string;
  suggestedAction: string;
  confidence: number;
  approvedById: string | null;
  approvedAt: string | null;
  applied: boolean;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reportedById: string;
  reportedByName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  contactId: string | null;
  contactName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  updates: TicketUpdate[];
  diagnoses: AIDiagnosis[];
};

export default function TicketDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'TicketDetailPage' });
  }, []);

  const [, params] = useRoute("/support/tickets/:id");
  const ticketId = params?.id;
  const { isViewer, isManager, user: currentUser, aiDiagnosisEnabled } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updateContent, setUpdateContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [dismissedDiagnosis, setDismissedDiagnosis] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["support", "tickets", ticketId],
    queryFn: () => api.get<TicketDetail>(`/support/tickets/${ticketId}`),
    enabled: !!ticketId,
  });

  const { data: staff } = useQuery({
    queryKey: ["users", "staff"],
    queryFn: () => api.get<{ id: string, name: string }[]>("/admin/users"),
    enabled: isManager,
  });

  const addUpdate = useMutation({
    mutationFn: (data: { content: string, isInternal: boolean }) => 
      api.post(`/support/tickets/${ticketId}/updates`, data),
    onSuccess: () => {
      setUpdateContent("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["support", "tickets", ticketId] });
      toast({ title: "Update posted" });
    }
  });

  const updateTicket = useMutation({
    mutationFn: (data: Partial<TicketDetail>) => 
      api.patch(`/support/tickets/${ticketId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support", "tickets", ticketId] });
      toast({ title: "Ticket updated" });
    }
  });

  const runDiagnosis = useMutation({
    mutationFn: () => api.post(`/support/tickets/${ticketId}/diagnose`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support", "tickets", ticketId] });
      toast({ title: "AI Diagnosis complete" });
    }
  });

  const approveDiagnosis = useMutation({
    mutationFn: (diagnosisId: string) => 
      api.post(`/support/tickets/${ticketId}/diagnose/approve`, { diagnosisId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support", "tickets", ticketId] });
      toast({ title: "Diagnosis approved" });
    }
  });

  if (isLoading) return <div className="p-8 space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!ticket) return <div className="p-8 text-center">Ticket not found</div>;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN": return "bg-blue-100 text-blue-700 border-blue-200";
      case "IN_PROGRESS": return "bg-amber-100 text-amber-700 border-amber-200";
      case "WAITING": return "bg-purple-100 text-purple-700 border-purple-200";
      case "RESOLVED": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT": return "bg-red-100 text-red-700 border-red-200 font-bold";
      case "HIGH": return "bg-orange-100 text-orange-700 border-orange-200";
      case "MEDIUM": return "bg-blue-100 text-blue-700 border-blue-200";
      case "LOW": return "bg-gray-100 text-gray-700 border-gray-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/support")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-gray-400">{ticket.ticketNumber}</span>
            <Badge className={getStatusColor(ticket.status)} variant="outline">{ticket.status.replace("_", " ")}</Badge>
            <Badge className={getPriorityColor(ticket.priority)} variant="outline">{ticket.priority}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
        </div>
        {!isViewer && (
          <div className="flex gap-2">
            <Select 
              value={ticket.status} 
              onValueChange={(val) => updateTicket.mutate({ status: val })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="WAITING">Waiting</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => updateTicket.mutate({ priority: "URGENT" })}>Set Urgent</DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">Delete Ticket</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {ticket.description}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Activity Thread
            </h3>
            
            <div className="space-y-4">
              {ticket.updates?.map((update) => {
                const isAiDiagnosis = update.content?.toLowerCase().includes("ai-suggested action approved") || update.content?.toLowerCase().includes("ai diagnosis");
                return (
                <div
                  key={update.id}
                  className={`p-4 rounded-lg border shadow-sm ${isAiDiagnosis ? 'bg-indigo-50/50 border-indigo-200' : update.isInternal ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold uppercase ${isAiDiagnosis ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>
                        {isAiDiagnosis ? <Sparkles className="h-3.5 w-3.5" /> : update.authorName?.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-sm font-semibold">{update.authorName}</span>
                      {isAiDiagnosis && <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">AI DIAGNOSIS</Badge>}
                      {update.isInternal && !isAiDiagnosis && <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">INTERNAL</Badge>}
                    </div>
                    <span className="text-xs text-gray-500">{format(new Date(update.createdAt), "MMM d, HH:mm")}</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{update.content}</div>
                </div>
              );})}
            </div>

            {!isViewer && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <Textarea 
                    placeholder="Type your reply or internal note here..." 
                    className="min-h-[100px]"
                    value={updateContent}
                    onChange={(e) => setUpdateContent(e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch id="internal-mode" checked={isInternal} onCheckedChange={setIsInternal} />
                      <Label htmlFor="internal-mode" className="text-xs font-medium text-gray-600">Internal Note</Label>
                    </div>
                    <Button 
                      size="sm" 
                      disabled={!updateContent.trim() || addUpdate.isPending}
                      onClick={() => addUpdate.mutate({ content: updateContent, isInternal })}
                    >
                      <Send className="h-4 w-4 mr-2" /> {isInternal ? "Post Note" : "Send Reply"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {ticket.status === "RESOLVED" && (
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Resolution Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-green-800 italic">
                  {ticket.resolutionNotes || "No resolution notes provided."}
                </div>
                {ticket.resolvedAt && (
                  <div className="text-xs text-green-600 mt-2">
                    Resolved on {format(new Date(ticket.resolvedAt), "MMM d, yyyy")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {ticket.status !== "RESOLVED" && !isViewer && (
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-700">
                  Resolve Ticket
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  placeholder="Describe how the issue was resolved..." 
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
                <Button 
                  variant="outline" 
                  className="w-full text-green-700 border-green-200 hover:bg-green-50"
                  disabled={!resolutionNotes.trim() || updateTicket.isPending}
                  onClick={() => updateTicket.mutate({ status: "RESOLVED", resolutionNotes })}
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Mark as Resolved
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-gray-400">Reporter</Label>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 uppercase">
                    {ticket.reportedByName?.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm font-medium">{ticket.reportedByName}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-gray-400">Assignee</Label>
                {isManager ? (
                  <Select 
                    value={ticket.assignedToId || "unassigned"} 
                    onValueChange={(val) => updateTicket.mutate({ assignedToId: val === "unassigned" ? null : val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {staff?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ticket.assignedToName || "Unassigned"}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 space-y-3 border-t border-gray-100 mt-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                  <span>{ticket.contactName || "No contact linked"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span>{ticket.organizationName || "No organization linked"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Reported {format(new Date(ticket.createdAt), "MMM d, yyyy")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {aiDiagnosisEnabled && (
          <Card className="border-indigo-200 overflow-hidden">
            <CardHeader className="bg-indigo-50/50 pb-2 border-b border-indigo-100">
              <CardTitle className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Ticket Diagnosis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {ticket.diagnoses && ticket.diagnoses.length > 0 && !dismissedDiagnosis ? (
                <div className="space-y-4">
                  {ticket.diagnoses.slice(0, 1).map((diag) => (
                    <div key={diag.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200">
                          {Math.round(diag.confidence * 100)}% Confidence
                        </Badge>
                        <span className="text-[10px] text-gray-400">{format(new Date(diag.createdAt), "HH:mm, MMM d")}</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase font-bold text-indigo-400">Confidence</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={diag.confidence * 100} className="h-2 flex-1" />
                          <span className="text-xs font-semibold text-indigo-700">{Math.round(diag.confidence * 100)}%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase font-bold text-indigo-400">Analysis</Label>
                        <p className="text-sm text-gray-700 italic">"{diag.diagnosis}"</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase font-bold text-indigo-400">Suggested Action</Label>
                        <p className="text-sm font-semibold text-gray-900">{diag.suggestedAction}</p>
                      </div>

                      {diag.approvedAt ? (
                        <div className="pt-2 flex items-center gap-2 text-xs font-medium text-green-600 bg-green-50 p-2 rounded">
                          <CheckCircle2 className="h-4 w-4" /> Approved
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {isManager && (
                            <Button
                              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                              size="sm"
                              onClick={() => approveDiagnosis.mutate(diag.id)}
                              disabled={approveDiagnosis.isPending}
                            >
                              {approveDiagnosis.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                              Approve & Add as Internal Note
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500"
                            onClick={() => setDismissedDiagnosis(true)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {isManager && (
                    <Button
                      variant="outline"
                      className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 mt-2"
                      size="sm"
                      onClick={() => { setDismissedDiagnosis(false); runDiagnosis.mutate(); }}
                      disabled={runDiagnosis.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" /> {runDiagnosis.isPending ? "Re-analyzing..." : "Re-run Diagnosis"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-gray-500">Run AI diagnosis to analyze the ticket and get suggested actions.</p>
                  {isManager && (
                    <Button
                      variant="outline"
                      className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      size="sm"
                      onClick={() => { setDismissedDiagnosis(false); runDiagnosis.mutate(); }}
                      disabled={runDiagnosis.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" /> {runDiagnosis.isPending ? "Analyzing..." : "Run AI Diagnosis"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
