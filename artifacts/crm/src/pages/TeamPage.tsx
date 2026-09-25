import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserPlus, LogOut, RotateCcw, Trash2, Copy, Clock, Shield, Mail } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface TeamUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
  jobTitle: string | null;
  sessionCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string | null;
  role: string;
  inviteTokenExpiresAt: string | null;
  createdAt: string;
}

// DEVELOPER and PLATFORM_BUILDER are platform-engineering roles.
// They must never be assignable to tenant team members — they block all tenant CRM data access.
const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "OPERATOR", label: "Team Member" },
  { value: "VIEWER", label: "Read Only" },
];

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "default";
  if (role === "DEVELOPER" || role === "PLATFORM_BUILDER") return "secondary";
  return "outline";
}

export default function TeamPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("OPERATOR");
  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null);
  const [editRoleUser, setEditRoleUser] = useState<TeamUser | null>(null);
  const [newRole, setNewRole] = useState("");

  const { data: users = [], isLoading } = useQuery<TeamUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/admin/users"),
  });

  const { data: pendingInvites = [] } = useQuery<PendingInvite[]>({
    queryKey: ["pending-invites"],
    queryFn: () => api.get("/admin/users/pending-invites"),
  });

  const { data: loginHistory = [] } = useQuery({
    queryKey: ["login-history", selectedUser?.id],
    queryFn: () => api.get(`/admin/users/${selectedUser!.id}/login-history`),
    enabled: !!selectedUser,
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post<any>("/admin/users/invite", { email: inviteEmail, role: inviteRole }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      setInviteResult({ inviteLink: data.inviteLink, email: data.email });
    },
    onError: (err: any) => toast({ title: "Invite failed", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/admin/users/${id}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditRoleUser(null);
      toast({ title: "Role updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/admin/users/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User status updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/force-logout`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: `Logged out ${data.sessionsRevoked} session(s)` });
    },
    onError: (err: any) => toast({ title: "Force logout failed", description: err.message, variant: "destructive" }),
  });

  const reset2faMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/reset-2fa`, {}),
    onSuccess: () => toast({ title: "2FA reset — user must re-enroll" }),
    onError: (err: any) => toast({ title: "Reset failed", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/admin/users/${id}/reset-password`, {}),
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.resetLink);
      toast({ title: "Reset link copied to clipboard", description: `Expires in 24 hours` });
    },
    onError: (err: any) => toast({ title: "Reset failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/pending-invites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      toast({ title: "Invite cancelled" });
    },
    onError: (err: any) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/admin/users/invite/resend/${id}`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      navigator.clipboard.writeText(data.inviteLink);
      toast({ title: "New invite link copied to clipboard" });
    },
    onError: (err: any) => toast({ title: "Resend failed", description: err.message, variant: "destructive" }),
  });

  function closeInvite() {
    setShowInvite(false);
    setInviteEmail("");
    setInviteRole("OPERATOR");
    setInviteResult(null);
    setCopied(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Team Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage users, roles, sessions, and invitations.</p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Invite User
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Team Members ({users.length})</TabsTrigger>
          <TabsTrigger value="invites">Pending Invites ({pendingInvites.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedUser(u); setShowUserDetail(true); }}>
                      <TableCell>
                        <div className="font-medium">{u.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                        {u.jobTitle && <div className="text-xs text-muted-foreground">{u.jobTitle}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Active" : "Suspended"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.sessionCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(u.createdAt), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditRoleUser(u); setNewRole(u.role); }}>Edit Role</Button>
                          <Button variant="ghost" size="sm" onClick={() => suspendMutation.mutate({ id: u.id, active: !u.active })}>
                            {u.active ? "Suspend" : "Activate"}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No pending invitations.</TableCell></TableRow>
                  ) : pendingInvites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell><Badge variant="outline">{inv.role}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.inviteTokenExpiresAt
                          ? new Date(inv.inviteTokenExpiresAt) < new Date()
                            ? <span className="text-destructive">Expired</span>
                            : formatDistanceToNow(new Date(inv.inviteTokenExpiresAt), { addSuffix: true })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.createdAt), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => resendInviteMutation.mutate(inv.id)}>Resend</Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelInviteMutation.mutate(inv.id)}>Cancel</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User detail dialog */}
      <Dialog open={showUserDetail} onOpenChange={(o) => { setShowUserDetail(o); if (!o) setSelectedUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedUser?.name || selectedUser?.email}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Email:</span> {selectedUser.email}</div>
                <div><span className="text-muted-foreground">Role:</span> <Badge variant={roleBadgeVariant(selectedUser.role)}>{selectedUser.role}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> {selectedUser.active ? "Active" : "Suspended"}</div>
                <div><span className="text-muted-foreground">Sessions:</span> {selectedUser.sessionCount}</div>
                {selectedUser.jobTitle && <div className="col-span-2"><span className="text-muted-foreground">Title:</span> {selectedUser.jobTitle}</div>}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Clock className="h-4 w-4" /> Login History</h3>
                {(loginHistory as any[]).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No session records found.</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {(loginHistory as any[]).map((s: any) => (
                      <div key={s.id} className="text-xs text-muted-foreground flex justify-between">
                        <span>{format(new Date(s.createdAt), "dd MMM yyyy HH:mm")}</span>
                        <span>{s.expiresAt ? `Expires ${format(new Date(s.expiresAt), "dd MMM")}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => forceLogoutMutation.mutate(selectedUser.id)}>
                  <LogOut className="h-4 w-4 mr-1" /> Force Logout
                </Button>
                <Button size="sm" variant="outline" onClick={() => resetPasswordMutation.mutate(selectedUser.id)}>
                  <Mail className="h-4 w-4 mr-1" /> Reset Password
                </Button>
                <Button size="sm" variant="outline" onClick={() => reset2faMutation.mutate(selectedUser.id)}>
                  <Shield className="h-4 w-4 mr-1" /> Reset 2FA
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit role dialog */}
      <Dialog open={!!editRoleUser} onOpenChange={(o) => { if (!o) setEditRoleUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Role</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Role for {editRoleUser?.email}</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleUser(null)}>Cancel</Button>
            <Button onClick={() => editRoleUser && updateRoleMutation.mutate({ id: editRoleUser.id, role: newRole })} disabled={updateRoleMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={(o) => { if (!o) closeInvite(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          {!inviteResult ? (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" type="email" />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInvite}>Cancel</Button>
                <Button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail.trim() || inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Sending…" : "Send Invite"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-2 space-y-3">
                <p className="text-sm text-muted-foreground">Invite created for <strong>{inviteResult.email}</strong>. Share this link:</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteResult.inviteLink} className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(inviteResult.inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copied && <p className="text-xs text-green-600">Copied!</p>}
              </div>
              <DialogFooter>
                <Button onClick={closeInvite}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and revoke all their sessions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
