import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  Webhook, Mail, MessageSquare, Zap, Globe, Database,
  Settings, CheckCircle2, AlertCircle, Plus, Trash2, Send, List, Copy
} from "lucide-react";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function getConnectors(): Promise<{ connectors: { connectorKey: string; active: boolean }[] }> {
  return api.get("/integrations/connectors");
}
async function saveConnector(key: string, config: Record<string, string>): Promise<void> {
  return api.put(`/integrations/connectors/${key}`, { config, active: true });
}
async function deleteConnector(key: string): Promise<void> {
  return api.delete(`/integrations/connectors/${key}`);
}
async function testSlack(): Promise<void> {
  return api.post("/integrations/connectors/slack/test", {});
}
async function getWebhooks(): Promise<{ webhooks: WebhookItem[] }> {
  return api.get("/integrations/webhooks");
}
async function createWebhook(data: { name: string; url: string; events: string[] }): Promise<{ webhook: WebhookItem }> {
  return api.post("/integrations/webhooks", data);
}
async function deleteWebhook(id: string): Promise<void> {
  return api.delete(`/integrations/webhooks/${id}`);
}
async function testWebhook(id: string): Promise<{ success: boolean; statusCode?: number; message: string }> {
  return api.post(`/integrations/webhooks/${id}/test`, {});
}
async function getWebhookLogs(id: string): Promise<{ logs: WebhookLog[] }> {
  return api.get(`/integrations/webhooks/${id}/logs`);
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  active: boolean;
  events: string[];
  inboundToken?: string;
  tenantId?: string;
  createdAt: string;
}

interface WebhookLog {
  id: string;
  eventType: string;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  attemptCount: number;
  errorMessage?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Connector definitions
// ---------------------------------------------------------------------------
interface ConnectorDef {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  fields?: { key: string; label: string; placeholder: string; type?: string }[];
  status: "available" | "coming_soon" | "built_in" | "inbound_webhook";
  testable?: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  {
    key: "sendgrid",
    name: "SendGrid",
    description: "Send outreach emails via SendGrid instead of Gmail.",
    icon: <Mail className="h-6 w-6 text-blue-500" />,
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "SG.xxxx", type: "password" },
      { key: "fromAddress", label: "From Address", placeholder: "hello@yourorg.com" },
      { key: "fromName", label: "From Name", placeholder: "Your Organisation" },
    ],
    status: "available",
  },
  {
    key: "slack",
    name: "Slack",
    description: "Send notifications to a Slack channel.",
    icon: <MessageSquare className="h-6 w-6 text-purple-500" />,
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/..." },
    ],
    status: "available",
    testable: true,
  },
  {
    key: "gmail",
    name: "Gmail",
    description: "Send emails via your connected Gmail account.",
    icon: <Mail className="h-6 w-6 text-red-500" />,
    status: "built_in",
  },
  {
    key: "zapier",
    name: "Zapier",
    description: "Trigger Zapier Zaps from Hubforte events via incoming webhooks.",
    icon: <Zap className="h-6 w-6 text-orange-500" />,
    status: "inbound_webhook",
  },
  {
    key: "make",
    name: "Make",
    description: "Trigger Make scenarios from Hubforte events via incoming webhooks.",
    icon: <Zap className="h-6 w-6 text-indigo-500" />,
    status: "inbound_webhook",
  },
  {
    key: "mailchimp",
    name: "Mailchimp",
    description: "Sync contacts to Mailchimp marketing lists.",
    icon: <Mail className="h-6 w-6 text-yellow-500" />,
    status: "coming_soon",
  },
  {
    key: "twilio",
    name: "Twilio",
    description: "Send SMS notifications via Twilio.",
    icon: <MessageSquare className="h-6 w-6 text-red-400" />,
    status: "coming_soon",
  },
  {
    key: "salesforce",
    name: "Salesforce",
    description: "Import contacts and organisations from Salesforce.",
    icon: <Database className="h-6 w-6 text-blue-600" />,
    status: "coming_soon",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    description: "Import contacts and deals from HubSpot.",
    icon: <Database className="h-6 w-6 text-orange-600" />,
    status: "coming_soon",
  },
  {
    key: "pipedrive",
    name: "Pipedrive",
    description: "Import contacts and pipeline from Pipedrive.",
    icon: <Database className="h-6 w-6 text-green-600" />,
    status: "coming_soon",
  },
  {
    key: "custom_webhook",
    name: "Custom Webhook",
    description: "Send events to any URL via custom webhooks.",
    icon: <Webhook className="h-6 w-6 text-gray-600" />,
    status: "available",
  },
];

const ALL_EVENTS = [
  "contact.created", "contact.updated", "contact.deleted",
  "organization.created", "organization.updated", "organization.deleted",
  "opportunity.created", "opportunity.updated",
  "activity.created",
  "task.created", "task.completed",
  "campaign.sent",
  "support.ticket.created", "support.ticket.resolved",
  "user.created",
];

// ---------------------------------------------------------------------------
// ConnectorCard
// ---------------------------------------------------------------------------
function ConnectorCard({
  def,
  connected,
  onConfigure,
}: {
  def: ConnectorDef;
  connected: boolean;
  onConfigure: () => void;
}) {
  const statusBadge = () => {
    if (def.status === "built_in") return <Badge className="bg-blue-100 text-blue-700 border-0">Built-in</Badge>;
    if (def.status === "coming_soon") return <Badge variant="outline" className="text-gray-400">Coming soon</Badge>;
    if (def.status === "inbound_webhook") return <Badge className="bg-purple-100 text-purple-700 border-0">Inbound webhook</Badge>;
    if (connected) return <Badge className="bg-green-100 text-green-700 border-0">Connected</Badge>;
    return <Badge variant="outline" className="text-gray-500">Not configured</Badge>;
  };

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {def.icon}
            <div>
              <CardTitle className="text-base">{def.name}</CardTitle>
              {statusBadge()}
            </div>
          </div>
        </div>
        <CardDescription className="mt-2 text-sm">{def.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {def.status === "available" && (
          <Button size="sm" variant="outline" onClick={onConfigure} className="gap-1">
            <Settings className="h-3.5 w-3.5" />
            Configure
          </Button>
        )}
        {def.status === "built_in" && (
          <Button size="sm" variant="outline" onClick={() => window.location.href = "/settings"} className="gap-1">
            <Settings className="h-3.5 w-3.5" />
            Manage in Settings
          </Button>
        )}
        {def.status === "inbound_webhook" && (
          <Button size="sm" variant="outline" onClick={onConfigure} className="gap-1">
            <Globe className="h-3.5 w-3.5" />
            View setup
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// InboundWebhookInstructions dialog
// ---------------------------------------------------------------------------
function InboundWebhookDialog({
  connectorName,
  webhooks,
  onClose,
}: {
  connectorName: string;
  webhooks: WebhookItem[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000") + "/api";

  const inboundHooks = webhooks.filter((h) => h.inboundToken);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast({ title: "Copied to clipboard" }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{connectorName} — Inbound Webhook Setup</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm text-gray-700">
          <p>
            To connect {connectorName} to Hubforte, create a webhook in Hubforte below, then use the
            generated inbound URL as the webhook destination in {connectorName}.
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-600">
            <li>Create a new webhook below (or use an existing one with an inbound token).</li>
            <li>Copy the inbound URL shown for that webhook.</li>
            <li>In {connectorName}, set that URL as the webhook/HTTP destination.</li>
            <li>Hubforte will receive and log all payloads sent to that URL.</li>
          </ol>
          {inboundHooks.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium text-gray-800">Your inbound webhook URLs:</p>
              {inboundHooks.map((h) => {
                const url = h.tenantId
                  ? `${apiBase}/webhooks/receive/${encodeURIComponent(h.tenantId)}/${h.inboundToken}`
                  : null;
                return (
                  <div key={h.id} className="flex items-center gap-2 bg-gray-50 rounded p-2">
                    <span className="text-xs font-medium text-gray-600 shrink-0">{h.name}:</span>
                    {url ? (
                      <>
                        <span className="text-xs text-gray-500 truncate flex-1">{url}</span>
                        <Button size="sm" variant="ghost" onClick={() => copyUrl(url)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 flex-1">Tenant ID unavailable — reload the page</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {inboundHooks.length === 0 && (
            <p className="text-gray-400 text-xs">No webhooks with inbound tokens yet. Create one in the Outgoing Webhooks section below.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WebhookLogsDialog
// ---------------------------------------------------------------------------
function WebhookLogsDialog({ webhookId, webhookName, onClose }: { webhookId: string; webhookName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-logs", webhookId],
    queryFn: () => getWebhookLogs(webhookId),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery Logs — {webhookName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-2 py-2">
          {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
          {!isLoading && (data?.logs ?? []).length === 0 && (
            <p className="text-sm text-gray-400">No delivery logs yet.</p>
          )}
          {(data?.logs ?? []).map((log) => (
            <div key={log.id} className="border border-gray-100 rounded p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {log.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="font-medium">{log.eventType}</span>
                  {log.statusCode && <Badge variant="outline" className="text-xs py-0">{log.statusCode}</Badge>}
                </div>
                <span className="text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              {log.attemptCount > 1 && <p className="text-gray-400">{log.attemptCount} attempts</p>}
              {log.errorMessage && <p className="text-red-500">{log.errorMessage}</p>}
              {log.responseBody && <p className="text-gray-500 truncate">{log.responseBody}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function IntegrationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [configuring, setConfiguring] = useState<ConnectorDef | null>(null);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: "", url: "", events: [] as string[] });
  const [viewingLogsFor, setViewingLogsFor] = useState<WebhookItem | null>(null);
  const [inboundInstructionsFor, setInboundInstructionsFor] = useState<string | null>(null);

  const { data: connectorsData } = useQuery({
    queryKey: ["integrations-connectors"],
    queryFn: getConnectors,
  });

  const { data: webhooksData } = useQuery({
    queryKey: ["integrations-webhooks"],
    queryFn: getWebhooks,
  });

  const connectedKeys = new Set((connectorsData?.connectors ?? []).filter((c) => c.active).map((c) => c.connectorKey));
  const webhooks = webhooksData?.webhooks ?? [];

  const saveMutation = useMutation({
    mutationFn: ({ key, config }: { key: string; config: Record<string, string> }) => saveConnector(key, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-connectors"] });
      toast({ title: "Connector saved" });
      setConfiguring(null);
    },
    onError: () => toast({ title: "Failed to save connector", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConnector,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-connectors"] });
      toast({ title: "Connector removed" });
      setConfiguring(null);
    },
    onError: () => toast({ title: "Failed to remove connector", variant: "destructive" }),
  });

  const testSlackMutation = useMutation({
    mutationFn: testSlack,
    onSuccess: () => toast({ title: "Slack test sent successfully" }),
    onError: () => toast({ title: "Slack test failed", variant: "destructive" }),
  });

  const createWebhookMutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-webhooks"] });
      toast({ title: "Webhook created" });
      setShowWebhookForm(false);
      setNewWebhook({ name: "", url: "", events: [] });
    },
    onError: () => toast({ title: "Failed to create webhook", variant: "destructive" }),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-webhooks"] });
      toast({ title: "Webhook deleted" });
    },
    onError: () => toast({ title: "Failed to delete webhook", variant: "destructive" }),
  });

  const testWebhookMutation = useMutation({
    mutationFn: testWebhook,
    onSuccess: (result) => toast({ title: result.success ? "Test delivered successfully" : `Test failed: ${result.message}` }),
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
  });

  const openConfigure = (def: ConnectorDef) => {
    if (def.status === "inbound_webhook") {
      setInboundInstructionsFor(def.name);
      return;
    }
    setConfiguring(def);
    setConfigFields({});
  };

  const toggleEvent = (event: string) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">Connect Hubforte to your other tools.</p>
      </div>

      {/* Connectors */}
      <section>
        <h2 className="text-lg font-medium text-gray-800 mb-4">Connectors</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTORS.map((def) => (
            <ConnectorCard
              key={def.key}
              def={def}
              connected={connectedKeys.has(def.key)}
              onConfigure={() => openConfigure(def)}
            />
          ))}
        </div>
      </section>

      {/* Outgoing Webhooks */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-800">Outgoing Webhooks</h2>
          <Button size="sm" onClick={() => setShowWebhookForm(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Webhook
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <p className="text-sm text-gray-400">No webhooks configured yet.</p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((hook) => (
              <Card key={hook.id} className="border-gray-200 shadow-sm">
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{hook.name}</p>
                    <p className="text-xs text-gray-400 truncate">{hook.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(hook.events as string[]).slice(0, 4).map((e) => (
                        <Badge key={e} variant="outline" className="text-xs py-0">{e}</Badge>
                      ))}
                      {(hook.events as string[]).length > 4 && (
                        <Badge variant="outline" className="text-xs py-0">+{(hook.events as string[]).length - 4} more</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hook.active ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <Button size="sm" variant="ghost" title="View logs" onClick={() => setViewingLogsFor(hook)}>
                      <List className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Send test" onClick={() => testWebhookMutation.mutate(hook.id)} disabled={testWebhookMutation.isPending}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteWebhookMutation.mutate(hook.id)} disabled={deleteWebhookMutation.isPending}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Configure connector dialog */}
      <Dialog open={!!configuring} onOpenChange={(open) => !open && setConfiguring(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure {configuring?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {configuring?.fields?.map((f) => (
              <div key={f.key}>
                <label className="text-sm font-medium text-gray-700">{f.label}</label>
                <Input
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={configFields[f.key] ?? ""}
                  onChange={(e) => setConfigFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            {connectedKeys.has(configuring?.key ?? "") && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => deleteMutation.mutate(configuring!.key)} disabled={deleteMutation.isPending}>
                Remove
              </Button>
            )}
            {configuring?.testable && connectedKeys.has(configuring.key) && (
              <Button variant="outline" onClick={() => testSlackMutation.mutate()} disabled={testSlackMutation.isPending}>
                Send Test
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate({ key: configuring!.key, config: configFields })} disabled={saveMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add webhook dialog */}
      <Dialog open={showWebhookForm} onOpenChange={setShowWebhookForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Outgoing Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Name</label>
              <Input placeholder="My webhook" value={newWebhook.name} onChange={(e) => setNewWebhook((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">URL</label>
              <Input placeholder="https://example.com/webhook" value={newWebhook.url} onChange={(e) => setNewWebhook((p) => ({ ...p, url: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Events</label>
              <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                {ALL_EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newWebhook.events.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="rounded"
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createWebhookMutation.mutate(newWebhook)}
              disabled={createWebhookMutation.isPending || !newWebhook.name || !newWebhook.url || newWebhook.events.length === 0}
            >
              Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook logs dialog */}
      {viewingLogsFor && (
        <WebhookLogsDialog
          webhookId={viewingLogsFor.id}
          webhookName={viewingLogsFor.name}
          onClose={() => setViewingLogsFor(null)}
        />
      )}

      {/* Inbound webhook instructions dialog */}
      {inboundInstructionsFor && (
        <InboundWebhookDialog
          connectorName={inboundInstructionsFor}
          webhooks={webhooks}
          onClose={() => setInboundInstructionsFor(null)}
        />
      )}
    </div>
  );
}
