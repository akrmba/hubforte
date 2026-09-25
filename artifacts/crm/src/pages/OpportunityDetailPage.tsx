import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { 
  ArrowLeft, 
  Calendar, 
  Building2, 
  DollarSign, 
  User, 
  Clock, 
  CheckCircle2, 
  MoreVertical, 
  Plus, 
  FileText, 
  Activity as ActivityIcon,
  MessageSquare,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const STAGES = ["PROSPECT", "APPROACH", "APPLIED", "AWARDED", "DECLINED", "LOST"] as const;

export default function OpportunityDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'OpportunityDetailPage' });
  }, []);

  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isViewer, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [noteContent, setNoteContent] = useState("");

  const { data: opportunity, isLoading } = useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => api.get<any>(`/opportunities/${id}`)
  });

  const { data: notes } = useQuery({
    queryKey: ["opportunity-notes", id],
    queryFn: () => api.get<any[]>(`/notes?opportunityId=${id}`).catch(() => [])
  });

  const { data: activities } = useQuery({
    queryKey: ["opportunity-activities", id],
    queryFn: () => api.get<any[]>(`/activities?opportunityId=${id}`).catch(() => [])
  });

  const updateOpportunity = useMutation({
    mutationFn: (data: any) => api.patch(`/opportunities/${id}`, data),
    onSuccess: () => {
      toast({ title: "Opportunity updated" });
      queryClient.invalidateQueries({ queryKey: ["opportunity", id] });
    }
  });

  const addNote = useMutation({
    mutationFn: (content: string) => api.post("/notes", { opportunityId: id, content }),
    onSuccess: () => {
      toast({ title: "Note added" });
      setNoteContent("");
      queryClient.invalidateQueries({ queryKey: ["opportunity-notes", id] });
    }
  });

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!opportunity) return <div className="p-8 text-center text-red-500">Opportunity not found</div>;

  const currentStageIndex = STAGES.indexOf(opportunity.stage as any);
  const isTerminal = ["AWARDED", "DECLINED", "LOST"].includes(opportunity.stage);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-2">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{opportunity.name}</h1>
            <Badge variant="secondary" className="text-[10px] uppercase font-bold">
              {opportunity.stage}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span>£{(parseFloat(opportunity.value) || 0).toLocaleString()}</span>
            {opportunity.funderName && (
              <>
                <span>•</span>
                <Link href={`/funders/${opportunity.funderId}`} className="hover:text-blue-600 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {opportunity.funderName}
                </Link>
              </>
            )}
          </div>
        </div>
        {!isViewer && (
          <div className="flex items-center gap-2">
            <Select 
              value={opportunity.stage} 
              onValueChange={(stage) => updateOpportunity.mutate({ stage })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Change Stage" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Stage Progression Bar */}
      <div className="w-full bg-gray-100 h-2 rounded-full flex overflow-hidden">
        {STAGES.map((s, idx) => {
          const isActive = idx <= currentStageIndex;
          const isCurrent = idx === currentStageIndex;
          const isSuccess = opportunity.stage === "AWARDED";
          const isFailure = ["DECLINED", "LOST"].includes(opportunity.stage);
          
          let bgColor = "bg-gray-200";
          if (isActive) {
            bgColor = isSuccess ? "bg-green-500" : isFailure ? "bg-red-500" : "bg-blue-500";
          }
          if (isCurrent && !isTerminal) bgColor = "bg-blue-600 animate-pulse";

          return (
            <div 
              key={s} 
              className={`flex-1 ${bgColor} border-r border-white last:border-0`} 
              title={s}
            />
          );
        })}
      </div>
      <div className="flex justify-between px-1">
        {STAGES.map((s, idx) => (
          <span key={s} className={`text-[10px] font-bold uppercase ${idx <= currentStageIndex ? 'text-gray-900' : 'text-gray-400'}`}>
            {s}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Opportunity Info</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</p>
                    <p className="text-sm font-semibold text-gray-900">{opportunity.ownerName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Organization Partner</p>
                    {opportunity.organizationId ? (
                      <Link href={`/organizations/${opportunity.organizationId}`} className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
                        {opportunity.organizationName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None linked</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Close</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {opportunity.expectedCloseDate ? format(new Date(opportunity.expectedCloseDate), "MMMM d, yyyy") : "-"}
                    </p>
                  </div>
                </div>
                {opportunity.actualCloseDate && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Close</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {format(new Date(opportunity.actualCloseDate), "MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {opportunity.description && (
                <div className="md:col-span-2 pt-4 border-t">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{opportunity.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Activity History</CardTitle>
                <CardDescription>Recent actions logged for this opportunity.</CardDescription>
              </div>
              {!isViewer && (
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" /> Log Activity
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activities?.length === 0 ? (
                <div className="text-center py-8 text-gray-500 italic text-sm">
                  No activities logged yet.
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-gray-100">
                  {activities?.map((activity) => (
                    <div key={activity.id} className="relative pl-10">
                      <div className="absolute left-0 top-1 h-8 w-8 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center z-10">
                        <ActivityIcon className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-900">{activity.type}</p>
                          <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{activity.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Notes */}
        <div className="space-y-6">
          <Card className="flex flex-col h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-gray-400" /> Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {!isViewer && (
                <div className="space-y-2">
                  <Textarea 
                    placeholder="Add a private note..." 
                    className="min-h-[100px]"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button 
                      size="sm" 
                      disabled={!noteContent.trim() || addNote.isPending}
                      onClick={() => addNote.mutate(noteContent)}
                    >
                      {addNote.isPending ? "Adding..." : "Add Note"}
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {notes?.map((note) => (
                  <div key={note.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-gray-900">{note.authorName}</span>
                      <span className="text-[10px] text-gray-400">{formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
                {notes?.length === 0 && (
                  <div className="text-center py-8 text-gray-400 italic text-sm">
                    No notes yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
