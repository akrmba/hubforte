import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Copy, Key, Webhook, ExternalLink, Plug, BookOpen, Mic, Paperclip, BarChart2 } from "lucide-react";
import { format } from "date-fns";

interface RegisteredApp {
  id: string;
  appName: string;
  appSlug: string;
  appUrl: string | null;
  webhookUrl: string | null;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface NewAppResult extends RegisteredApp {
  apiKey: string;
  webhookSecret: string;
}

const ALL_SCOPES = [
  { value: "contacts.read", label: "Contacts — Read" },
  { value: "contacts.write", label: "Contacts — Write" },
  { value: "organizations.read", label: "Organizations — Read" },
  { value: "organizations.write", label: "Organizations — Write" },
  { value: "activities.read", label: "Activities — Read" },
  { value: "activities.write", label: "Activities — Write" },
  { value: "deals.read", label: "Deals — Read" },
  { value: "deals.write", label: "Deals — Write" },
  { value: "notes.read", label: "Notes — Read" },
  { value: "notes.write", label: "Notes — Write" },
  { value: "lms.read", label: "LMS — Read" },
];

const TEMPLATES = [
  { icon: Mic, title: "Voice Agent", description: "Log calls and look up contacts by phone number in real time." },
  { icon: Paperclip, title: "Attachment Monitor", description: "Track when shared documents are opened and for how long." },
  { icon: BarChart2, title: "Custom Analytics App", description: "Pull CRM data into your own dashboards and reporting tools." },
];

export default function AppsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showRegister, setShowRegister] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RegisteredApp | null>(null);
  const [newAppResult, setNewAppResult] = useState<NewAppResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [appName, setAppName] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  const { data: apps = [], isLoading } = useQuery<RegisteredApp[]>({
    queryKey: ["apps"],
    queryFn: () => api.get("/apps"),
  });

  const registerMutation = useMutation({
    mutationFn: (body: { appName: string; appUrl?: string; webhookUrl?: string; scopes: string[] }) =>
      api.post<NewAppResult>("/apps", body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      setShowRegister(false);
      resetForm();
      setNewAppResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/apps/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      setDeleteTarget(null);
      toast({ title: "App removed" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setAppName("");
    setAppUrl("");
    setWebhookUrl("");
    setSelectedScopes([]);
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  function copyToClipboard(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Apps</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect Hubforte to custom tools and standalone applications via API key authentication.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/docs/APP_INTEGRATION_GUIDE.md" target="_blank" rel="noopener noreferrer">
              <BookOpen className="h-4 w-4 mr-1" /> Developer Guide
            </a>
          </Button>
          <Button size="sm" onClick={() => setShowRegister(true)}>
            <Plus className="h-4 w-4 mr-1" /> Register New App
          </Button>
        </div>
      </div>

      {/* Registered apps list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading apps…</div>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Plug className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No apps registered yet.</p>
            <p className="text-sm mt-1">Register your first app to get an API key.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{app.appName}</span>
                    <Badge variant={app.status === "active" ? "default" : "secondary"}>
                      {app.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {app.appUrl && <div>URL: {app.appUrl}</div>}
                    {app.webhookUrl && <div>Webhook: {app.webhookUrl}</div>}
                    <div>
                      Scopes:{" "}
                      {app.scopes.length > 0
                        ? app.scopes.map((s) => (
                            <Badge key={s} variant="outline" className="mr-1 text-xs">{s}</Badge>
                          ))
                        : <span className="italic">none</span>}
                    </div>
                    <div>
                      Registered {format(new Date(app.createdAt), "dd MMM yyyy")}
                      {app.lastUsedAt && ` · Last used ${format(new Date(app.lastUsedAt), "dd MMM yyyy HH:mm")}`}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => setDeleteTarget(app)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* App templates */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">App Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <Card key={t.title} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <t.icon className="h-4 w-4 text-primary" />
                  {t.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>{t.description}</p>
                <a
                  href="/docs/APP_INTEGRATION_GUIDE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs flex items-center gap-1 hover:underline"
                >
                  View guide <ExternalLink className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Register dialog */}
      <Dialog open={showRegister} onOpenChange={(o) => { setShowRegister(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register New App</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>App Name *</Label>
              <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="My Voice Agent" />
            </div>
            <div className="space-y-1">
              <Label>App URL</Label>
              <Input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://myapp.example.com" />
            </div>
            <div className="space-y-1">
              <Label>Webhook URL</Label>
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://myapp.example.com/webhooks/hubforte" />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedScopes.includes(s.value)}
                      onCheckedChange={() => toggleScope(s.value)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRegister(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => registerMutation.mutate({ appName, appUrl: appUrl || undefined, webhookUrl: webhookUrl || undefined, scopes: selectedScopes })}
              disabled={!appName.trim() || registerMutation.isPending}
            >
              {registerMutation.isPending ? "Registering…" : "Register App"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New app credentials dialog — shown once */}
      <Dialog open={!!newAppResult} onOpenChange={(o) => { if (!o) setNewAppResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> App Registered — Save Your Keys
            </DialogTitle>
          </DialogHeader>
          {newAppResult && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                These credentials are shown <strong>once only</strong>. Copy them now and store them securely.
              </p>
              {[
                { label: "API Key", field: "apiKey", value: newAppResult.apiKey },
                { label: "Webhook Secret", field: "webhookSecret", value: newAppResult.webhookSecret },
              ].map(({ label, field, value }) => (
                <div key={field} className="space-y-1">
                  <Label>{label}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={value} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(value, field)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copiedField === field && <p className="text-xs text-green-600">Copied!</p>}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Use the API Key in the <code className="bg-muted px-1 rounded">X-Hubforte-App-Key</code> header for all API calls.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewAppResult(null)}>Done — I've saved my keys</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove app?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the API key for <strong>{deleteTarget?.appName}</strong>. Any app using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remove App
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
