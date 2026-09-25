import { useEffect } from 'react';
import { useState } from "react";
import { logUserAction } from "../lib/analytics";
import { useListUsers, getListUsersQueryKey, useUpdateUser, useListErrorLogs, getListErrorLogsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldAlert, Activity, UserCog, Bot, Zap, Play, CheckCircle, XCircle, Clock, UserPlus, Copy, Check, ChevronDown, ChevronRight, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { getRoleLabel, getRoleDescription, ASSIGNABLE_ROLES } from "@/lib/roles";

export default function AdminPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'AdminPage' });
  }, []);

  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("OPERATOR");
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiLogsPage, setAiLogsPage] = useState(1);
  const AI_LOGS_PER_PAGE = 25;

  const inviteMutation = useMutation({
    mutationFn: () => api.post<any>("/admin/users/invite", { email: inviteEmail, role: inviteRole }),
    onSuccess: (data) => {
      setInviteResult({ token: data.inviteToken, email: data.email });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    },
    onError: (err: any) => {
      toast({ title: "Invite failed", description: err.message || "Could not send invite", variant: "destructive" });
    },
  });

  const copyInviteLink = () => {
    if (!inviteResult) return;
    const link = `${window.location.origin}/accept-invite?token=${inviteResult.token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeInviteDialog = () => {
    setShowInviteDialog(false);
    setInviteEmail("");
    setInviteRole("OPERATOR");
    setInviteResult(null);
    setCopied(false);
  };

  const { data: users, isLoading: usersLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey(), enabled: isAdmin } });
  const { data: errors, isLoading: errorsLoading } = useListErrorLogs({ query: { queryKey: getListErrorLogsQueryKey(), enabled: isAdmin } });

  const { data: aiLogs, isLoading: aiLogsLoading } = useQuery({
    queryKey: ["ai-logs"],
    queryFn: () => api.get("/ai/logs"),
    enabled: isAdmin,
    retry: false,
  });

  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ["remediation-policies"],
    queryFn: () => api.get("/remediation/policies"),
    enabled: isAdmin,
    retry: false,
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["remediation-runs"],
    queryFn: () => api.get("/remediation/runs"),
    enabled: isAdmin,
    retry: false,
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["remediation-dashboard"],
    queryFn: () => api.get<any>("/remediation/dashboard"),
    enabled: isAdmin,
    retry: false,
    refetchInterval: 30000, // Refresh every 30s
  });

  const updateUserMutation = useUpdateUser();

  const policyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/remediation/policies/${id}`, data),
    onSuccess: () => {
      toast({ title: "Policy updated" });
      queryClient.invalidateQueries({ queryKey: ["remediation-policies"] });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/remediation/policies/${id}/evaluate`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Evaluation complete: ${data.affectedCount ?? 0} records affected` });
    },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => api.post(`/remediation/policies/${id}/run`, {}),
    onSuccess: () => {
      toast({ title: "Remediation run created" });
      queryClient.invalidateQueries({ queryKey: ["remediation-runs"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/remediation/runs/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "Run approved and executed" });
      queryClient.invalidateQueries({ queryKey: ["remediation-runs"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/remediation/runs/${id}/reject`, {}),
    onSuccess: () => {
      toast({ title: "Run rejected" });
      queryClient.invalidateQueries({ queryKey: ["remediation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["remediation-dashboard"] });
    },
  });

  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [showRunDetail, setShowRunDetail] = useState(false);

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.patch(`/admin/error-logs/${id}/resolve`, { note }),
    onSuccess: () => {
      toast({ title: "Error marked as resolved" });
      queryClient.invalidateQueries({ queryKey: getListErrorLogsQueryKey() });
    },
  });

  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserMutation.mutate({ id: userId, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: "User role updated" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      }
    });
  };

  const toggleActive = (userId: string, currentStatus: boolean) => {
    updateUserMutation.mutate({ id: userId, data: { active: !currentStatus } }, {
      onSuccess: () => {
        toast({ title: `User ${!currentStatus ? 'activated' : 'deactivated'}` });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      }
    });
  };

  const policiesList = Array.isArray((policies as any)?.policies) ? (policies as any).policies : (Array.isArray(policies) ? policies : []);
  const runsList = Array.isArray((runs as any)?.runs) ? (runs as any).runs : (Array.isArray(runs) ? runs : []);
  const logsList = Array.isArray((aiLogs as any)?.logs) ? (aiLogs as any).logs : (Array.isArray(aiLogs) ? aiLogs : []);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
      APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
      RUNNING: "bg-violet-50 text-violet-700 border-violet-200",
      COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
      FAILED: "bg-red-50 text-red-700 border-red-200",
      REJECTED: "bg-gray-50 text-gray-700 border-gray-200",
    };
    return map[status] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-red-600" /> Admin Console
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, permissions, AI usage, and automation policies.</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users" className="flex items-center gap-2"><UserCog className="h-4 w-4" /> Users</TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center gap-2"><Activity className="h-4 w-4" /> System Logs</TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI Usage</TabsTrigger>
          <TabsTrigger value="automation" className="flex items-center gap-2"><Zap className="h-4 w-4" /> Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><UserCog className="h-5 w-5" /> User Management</CardTitle>
              <Button size="sm" onClick={() => setShowInviteDialog(true)} className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Invite User
              </Button>
            </CardHeader>

            <Dialog open={showInviteDialog} onOpenChange={(open) => { if (!open) closeInviteDialog(); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite New User</DialogTitle>
                </DialogHeader>
                {inviteResult ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700">
                      Invite created for <strong>{inviteResult.email}</strong>. Share the link below with the user (development: also visible in server logs).
                    </p>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/accept-invite?token=${inviteResult.token}`}
                        className="font-mono text-xs"
                      />
                      <Button variant="outline" size="icon" onClick={copyInviteLink}>
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <DialogFooter>
                      <Button onClick={closeInviteDialog}>Done</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(); }} className="space-y-4">
                    <div>
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input id="invite-email" type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com" className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="invite-role">Role</Label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger id="invite-role" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value}>
                              <div className="flex flex-col">
                                <span>{r.label}</span>
                                <span className="text-xs text-gray-400">{r.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={closeInviteDialog}>Cancel</Button>
                      <Button type="submit" disabled={inviteMutation.isPending}>
                        {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                      </Button>
                    </DialogFooter>
                  </form>
                )}
              </DialogContent>
            </Dialog>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : (
                    users?.filter(u => isSuperAdmin || u.role !== 'SUPER_ADMIN').map(u => (
                      <TableRow key={u.id} className={!u.active ? "opacity-60 bg-gray-50" : ""}>
                        <TableCell>
                          <div className="font-medium text-gray-900">{u.name}</div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                          {u.jobTitle && (
                            <div className="text-xs text-gray-400 mt-0.5">{u.jobTitle}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <div className="flex items-center gap-1">
                              {u.role === 'SUPER_ADMIN' || u.role === 'PLATFORM_OWNER' ? (
                                <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">
                                  {getRoleLabel(u.role)}
                                </Badge>
                              ) : (
                                <Select value={u.role} onValueChange={(val) => handleRoleChange(u.id, val)}>
                                  <SelectTrigger className="w-[150px] h-8 text-xs">
                                    <SelectValue>{getRoleLabel(u.role)}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ASSIGNABLE_ROLES.map(r => (
                                      <SelectItem key={r.value} value={r.value}>
                                        <div className="flex flex-col py-0.5">
                                          <span className="font-medium">{r.label}</span>
                                          <span className="text-xs text-gray-400">{r.description}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-gray-300 cursor-help flex-shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[200px] text-xs">
                                  {getRoleDescription(u.role)}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.active ? "default" : "secondary"} className={u.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}>
                            {u.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(u.createdAt!).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => toggleActive(u.id, u.active)}
                            className={`text-sm font-medium ${u.active ? 'text-red-600 hover:text-red-800' : 'text-emerald-600 hover:text-emerald-800'}`}
                          >
                            {u.active ? "Deactivate" : "Activate"}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5" /> System Error Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Time</TableHead>
                    <TableHead className="w-[80px]">Level</TableHead>
                    <TableHead>Summary / Details</TableHead>
                    <TableHead className="w-[100px] text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : errors?.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-500">No recent errors</TableCell></TableRow>
                  ) : (
                    errors?.map((err: any) => (
                      <TableRow key={err.id} className={err.resolved ? "opacity-60 bg-gray-50" : ""}>
                        <TableCell className="text-xs text-gray-500 align-top pt-4">
                          {formatDistanceToNow(new Date(err.createdAt), { addSuffix: true })}
                          {err.source && <div className="text-[10px] text-gray-400 mt-0.5">{err.source}</div>}
                        </TableCell>
                        <TableCell className="align-top pt-4">
                          <Badge variant="outline" className={`text-[10px] uppercase font-bold
                            ${err.level === 'ERROR' ? 'bg-red-50 text-red-700 border-red-200' :
                              err.level === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-gray-50 text-gray-700'}`}>
                            {err.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          {err.plainEnglish ? (
                            <p className="text-sm text-gray-900 mb-1">{err.plainEnglish}</p>
                          ) : (
                            <p className="text-sm font-medium text-gray-900 mb-1">{err.message}</p>
                          )}
                          {err.route && <span className="text-[11px] text-gray-400 font-mono">{err.route}</span>}
                          <Collapsible open={expandedErrors.has(err.id)}>
                            <CollapsibleTrigger asChild>
                              <button
                                onClick={() => toggleExpanded(err.id)}
                                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 mt-1"
                              >
                                {expandedErrors.has(err.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                Technical details
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-2 space-y-1">
                                {err.plainEnglish && <p className="text-xs text-gray-600"><strong>Message:</strong> {err.message}</p>}
                                {err.requestId && <p className="text-[11px] text-gray-400">Request ID: {err.requestId}</p>}
                                {err.stack && (
                                  <pre className="text-[10px] bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto text-gray-600 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                                    {err.stack}
                                  </pre>
                                )}
                                {err.metadata && Object.keys(err.metadata).length > 0 && (
                                  <pre className="text-[10px] bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto text-gray-600">
                                    {JSON.stringify(err.metadata, null, 2)}
                                  </pre>
                                )}
                                {err.resolvedNote && <p className="text-xs text-emerald-700"><strong>Resolution:</strong> {err.resolvedNote}</p>}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </TableCell>
                        <TableCell className="align-top pt-4 text-right">
                          {err.resolved ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Resolved</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={resolveMutation.isPending}
                              onClick={() => resolveMutation.mutate({ id: err.id })}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["draftEmail", "summariseRelationship", "diagnoseTicket", "suggestNextAction", "cleanContactData"].map(feature => {
                const featureLogs = logsList.filter((l: any) => l.feature === feature);
                const successCount = featureLogs.filter((l: any) => l.success).length;
                return (
                  <Card key={feature} className="border-gray-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-500 font-medium capitalize mb-1">{feature.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-2xl font-bold text-gray-900">{featureLogs.length}</p>
                      <p className="text-xs text-gray-400 mt-1">{successCount} successful</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {(() => {
              const totalAiLogs = logsList.length;
              const totalPages = Math.max(1, Math.ceil(totalAiLogs / AI_LOGS_PER_PAGE));
              const paginatedLogs = logsList.slice((aiLogsPage - 1) * AI_LOGS_PER_PAGE, aiLogsPage * AI_LOGS_PER_PAGE);
              return (
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base">AI Interaction Logs</CardTitle>
                <span className="text-xs text-gray-400">{totalAiLogs} total</span>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiLogsLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : logsList.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">No AI interactions yet</TableCell></TableRow>
                    ) : (
                      paginatedLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.feature}</TableCell>
                          <TableCell className="text-sm text-gray-600">{log.userName || log.userId}</TableCell>
                          <TableCell className="text-sm text-gray-600">{log.latencyMs}ms</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={log.success ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                              {log.success ? "OK" : "Error"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <Button variant="outline" size="sm" disabled={aiLogsPage <= 1} onClick={() => setAiLogsPage(p => p - 1)}>Previous</Button>
                    <span className="text-xs text-gray-500">Page {aiLogsPage} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={aiLogsPage >= totalPages} onClick={() => setAiLogsPage(p => p + 1)}>Next</Button>
                  </div>
                )}
              </CardContent>
            </Card>
              );
            })()}
          </div>
        </TabsContent>

        <TabsContent value="automation">
          <div className="space-y-8">
            {/* Summary cards */}
            {!dashboardLoading && dashboard && (
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 font-medium mb-1">Pending Approval</p>
                    <p className="text-2xl font-bold text-amber-600">{(dashboard.pendingRuns || []).length}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 font-medium mb-1">Completed Today</p>
                    <p className="text-2xl font-bold text-emerald-600">{(dashboard.completedToday || []).length}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 font-medium mb-1">Recent Failures</p>
                    <p className="text-2xl font-bold text-red-600">{(dashboard.failedRuns || []).length}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Pending Approval Runs */}
            {!dashboardLoading && dashboard && (dashboard.pendingRuns || []).length > 0 && (
              <Card className="border-amber-200 shadow-sm">
                <CardHeader className="bg-amber-50/50 border-b border-amber-100">
                  <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /> Pending Approval</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Policy</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard.pendingRuns || []).map((run: any) => {
                        const ctx = run.input?.context || {};
                        const targetLabel = ctx.email || ctx.campaignName || ctx.targetId || run.policyId;
                        return (
                          <TableRow key={run.id}>
                            <TableCell>
                              <div className="font-medium text-sm text-gray-900">{run.policyName}</div>
                              <button
                                className="text-[11px] text-blue-600 hover:text-blue-800 mt-0.5"
                                onClick={() => { setSelectedRun(run); setShowRunDetail(true); }}
                              >
                                View details
                              </button>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">{targetLabel}</TableCell>
                            <TableCell className="text-xs text-gray-400">
                              {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMutation.mutate(run.id)} disabled={approveMutation.isPending}>
                                  <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(run.id)} disabled={rejectMutation.isPending}>
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Policies */}
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Remediation Policies</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Requires Approval</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policiesLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : policiesList.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">No policies configured</TableCell></TableRow>
                    ) : (
                      policiesList.map((policy: any) => (
                        <TableRow key={policy.id}>
                          <TableCell>
                            <div className="font-medium text-gray-900 text-sm">{policy.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{policy.description}</div>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 max-w-[200px]">{policy.trigger}</TableCell>
                          <TableCell>
                            <Switch
                              checked={policy.requiresApproval}
                              onCheckedChange={(val) => policyMutation.mutate({ id: policy.id, data: { requiresApproval: val } })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={policy.isEnabled}
                              onCheckedChange={(val) => policyMutation.mutate({ id: policy.id, data: { isEnabled: val } })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => evaluateMutation.mutate(policy.id)} disabled={evaluateMutation.isPending}>
                                Evaluate
                              </Button>
                              <Button size="sm" onClick={() => runMutation.mutate(policy.id)} disabled={!policy.isEnabled || runMutation.isPending}>
                                <Play className="h-3 w-3 mr-1" /> Run
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Run History */}
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : runsList.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">No runs yet</TableCell></TableRow>
                    ) : (
                      runsList.map((run: any) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium text-sm text-gray-900">{run.policyName || run.policyId}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] uppercase ${statusBadge(run.status)}`}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{run.triggeredByName || run.triggeredById}</TableCell>
                          <TableCell className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {run.status === "PENDING_APPROVAL" && (
                                <>
                                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMutation.mutate(run.id)} disabled={approveMutation.isPending}>
                                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(run.id)} disabled={rejectMutation.isPending}>
                                    <XCircle className="h-3 w-3 mr-1" /> Reject
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => { setSelectedRun(run); setShowRunDetail(true); }}>
                                Details
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Run detail dialog */}
          <Dialog open={showRunDetail} onOpenChange={(open) => { if (!open) setShowRunDetail(false); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Remediation Run Details</DialogTitle>
              </DialogHeader>
              {selectedRun && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-gray-500">Policy</Label>
                    <p className="text-sm font-medium">{selectedRun.policyName || selectedRun.policyId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Status</Label>
                    <Badge variant="outline" className={`text-[10px] uppercase ml-2 ${statusBadge(selectedRun.status)}`}>
                      {selectedRun.status}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Triggered By</Label>
                    <p className="text-sm">{selectedRun.triggeredByName || selectedRun.triggeredById || "System (auto)"}</p>
                  </div>
                  {selectedRun.approvedByName && (
                    <div>
                      <Label className="text-xs text-gray-500">Approved By</Label>
                      <p className="text-sm">{selectedRun.approvedByName}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-gray-500">Created</Label>
                    <p className="text-sm">{new Date(selectedRun.createdAt).toLocaleString()}</p>
                  </div>
                  {selectedRun.executedAt && (
                    <div>
                      <Label className="text-xs text-gray-500">Executed At</Label>
                      <p className="text-sm">{new Date(selectedRun.executedAt).toLocaleString()}</p>
                    </div>
                  )}
                  {selectedRun.input && (
                    <div>
                      <Label className="text-xs text-gray-500">Input / Context</Label>
                      <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto mt-1 max-h-[150px]">
                        {JSON.stringify(selectedRun.input, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedRun.output && (
                    <div>
                      <Label className="text-xs text-gray-500">Output / Result</Label>
                      <pre className="text-xs bg-emerald-50 p-2 rounded border border-emerald-100 overflow-x-auto mt-1 max-h-[150px]">
                        {JSON.stringify(selectedRun.output, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedRun.error && (
                    <div>
                      <Label className="text-xs text-gray-500">Error</Label>
                      <pre className="text-xs bg-red-50 p-2 rounded border border-red-100 overflow-x-auto mt-1 max-h-[150px] text-red-700">
                        {selectedRun.error}
                      </pre>
                    </div>
                  )}
                  {selectedRun.status === "PENDING_APPROVAL" && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3">
                      <p className="text-sm text-amber-800">
                        <strong>Action required:</strong> This run is pending approval. Review the input/context above and click Approve to execute the remediation, or Reject to cancel.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRunDetail(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
