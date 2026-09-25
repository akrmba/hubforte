import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, HelpCircle, Wrench, Clock, FileCode } from "lucide-react";
import { format } from "date-fns";

interface SharedEntry {
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
  relevantFiles: string[];
}

function statusBadge(status: string) {
  if (status === "fixed") return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Fixed</Badge>;
  if (status === "known_issue") return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Known Issue</Badge>;
  if (status === "working_as_expected") return <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" />Working as Expected</Badge>;
  return <Badge variant="destructive"><HelpCircle className="h-3 w-3 mr-1" />Needs Investigation</Badge>;
}

export default function DeveloperSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading, error } = useQuery<SharedEntry>({
    queryKey: ["kb-share", token],
    queryFn: () => api.get(`/super-admin/knowledge-base/share/${token}`),
    enabled: !!token,
    retry: false,
  });

  const markFixedMutation = useMutation({
    mutationFn: () => api.post(`/super-admin/knowledge-base/${entry!.id}/mark-fixed`, { shareToken: token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-share", token] });
      toast({ title: "Marked as fixed — the owner will be notified." });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center space-y-2">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-semibold">Share link not found</p>
            <p className="text-sm text-muted-foreground">
              This link may have expired or been revoked. Ask the owner to generate a new share link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Wrench className="h-4 w-4" />
          <span>Hubforte — Developer Error Brief</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(entry.status)}
              {entry.module && <Badge variant="outline">{entry.module}</Badge>}
            </div>
            <CardTitle className="font-mono text-base mt-2 break-all">{entry.errorPattern}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> First seen: {format(new Date(entry.firstSeenAt), "dd MMM yyyy")}</span>
              <span>Last seen: {format(new Date(entry.lastSeenAt), "dd MMM yyyy")}</span>
              <span>Occurrences: {entry.occurrenceCount}</span>
              <span>Auto-fixed: {entry.autoFixed === "yes" ? "Yes" : "No"}</span>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-1">What this means</h2>
              {entry.plainEnglish ? (
                <p className="text-sm">{entry.plainEnglish}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No explanation available yet.</p>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-1">How to fix it</h2>
              {entry.fixSteps ? (
                <pre className="text-sm whitespace-pre-wrap bg-muted rounded p-3">{entry.fixSteps}</pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">No fix steps documented yet.</p>
              )}
            </div>

            {entry.relevantFiles && entry.relevantFiles.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-1 flex items-center gap-1">
                  <FileCode className="h-4 w-4" /> Relevant Files
                </h2>
                <ul className="space-y-1">
                  {entry.relevantFiles.map((f) => (
                    <li key={f} className="font-mono text-xs bg-muted rounded px-2 py-1 inline-block mr-1 mb-1">{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-3">
                This view shows only error details and fix steps. No client or tenant data is included.
              </p>
              {entry.status !== "fixed" && (
                <Button
                  size="sm"
                  onClick={() => markFixedMutation.mutate()}
                  disabled={markFixedMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {markFixedMutation.isPending ? "Marking…" : "Mark as Fixed"}
                </Button>
              )}
              {entry.status === "fixed" && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" /> This issue has been marked as fixed.
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
