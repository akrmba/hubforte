import { useEffect, useState } from 'react';
import { useGetGmailStatus, getGetGmailStatusQueryKey, useDisconnectGmail, useGetGmailAuthUrl } from "@workspace/api-client-react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Mail, Shield, AlertCircle, CheckCircle2, Lock, Copy, Download, Check, Sparkles, Loader2, Trash2 } from "lucide-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export default function SettingsPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'SettingsPage' });
  }, []);

  const { user, isAdmin, byokEnabled } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify" | "backup">("idle");
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string; manualEntryCode: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableDialog, setDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [copied, setCopied] = useState(false);

  // AI Settings state
  const [aiProvider, setAiProvider] = useState("openrouter");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("deepseek/deepseek-chat");
  const [aiMonthlyBudget, setAiMonthlyBudget] = useState(10);
  const [aiFeatures, setAiFeatures] = useState({
    emailComposer: true, contactSummary: true, leadScore: true, nextBestAction: true, navHelper: true,
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  const { data: aiConfig, refetch: refetchAiConfig } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<any>("/settings/ai"),
  });

  // Hydrate form from saved config when it loads
  useEffect(() => {
    if (aiConfig?.configured) {
      setAiProvider(aiConfig.provider ?? "openrouter");
      setAiModel(aiConfig.model ?? "deepseek/deepseek-chat");
      setAiMonthlyBudget(aiConfig.monthlyBudgetUSD ?? 10);
      if (aiConfig.features) {
        setAiFeatures({
          emailComposer: aiConfig.features.emailComposer ?? true,
          contactSummary: aiConfig.features.contactSummary ?? true,
          leadScore: aiConfig.features.leadScore ?? true,
          nextBestAction: aiConfig.features.nextBestAction ?? true,
          navHelper: aiConfig.features.navHelper ?? true,
        });
      }
    }
  }, [aiConfig]);

  const { data: aiUsage } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<any>("/settings/ai/usage"),
  });

  const handleSaveAiSettings = async () => {
    // Allow saving without a new key if config already exists (updating non-key fields)
    if (!aiApiKey && !aiConfig?.configured) {
      toast({ title: "API key is required", variant: "destructive" });
      return;
    }
    setAiSaving(true);
    try {
      const payload: any = { provider: aiProvider, model: aiModel, monthlyBudget: aiMonthlyBudget, features: aiFeatures };
      // Only include apiKey if a new one was entered
      if (aiApiKey) payload.apiKey = aiApiKey;
      // If updating without a new key, we need to re-send the existing key — backend requires it.
      // Use a sentinel to indicate "keep existing key" by fetching it via test endpoint first.
      // Simplest approach: require key only for new configs, for updates send a PATCH-style request.
      if (!aiApiKey && aiConfig?.configured) {
        // POST /settings/ai/update-meta — update model, budget, and toggles only (no provider change without new key)
        await api.post("/settings/ai/update-meta", { model: aiModel, monthlyBudget: aiMonthlyBudget, features: aiFeatures });
      } else {
        await api.post("/settings/ai", payload);
      }
      toast({ title: "AI settings saved" });
      setAiApiKey("");
      refetchAiConfig();
      queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
    } catch (err: any) {
      toast({ title: "Failed to save AI settings", description: err.message, variant: "destructive" });
    } finally {
      setAiSaving(false);
    }
  };

  const handleRemoveAiSettings = async () => {
    try {
      await api.delete("/settings/ai");
      toast({ title: "AI settings removed. Using system default." });
      refetchAiConfig();
    } catch (err: any) {
      toast({ title: "Failed to remove AI settings", description: err.message, variant: "destructive" });
    }
  };

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    try {
      const result = await api.post<any>("/settings/ai/test", {});
      if (result.success) {
        toast({ title: `AI connection OK — ${result.provider} / ${result.model}` });
      } else {
        toast({ title: "AI test failed", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "AI test failed", description: err.message, variant: "destructive" });
    } finally {
      setAiTesting(false);
    }
  };

  const { data: gmailStatus, isLoading } = useGetGmailStatus({
    query: { queryKey: getGetGmailStatusQueryKey() }
  });

  const { refetch: getAuthUrl } = useGetGmailAuthUrl({
    query: { enabled: false, queryKey: ["gmail-auth"] }
  });

  const disconnectMutation = useDisconnectGmail();

  const { data: twoFAStatus, refetch: refetchTwoFA } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => api.get<any>("/auth/me").then((u: any) => ({ totpEnabled: !!u.totpEnabled })),
  });

  const setupMutation = useMutation({
    mutationFn: () => api.post<{ secret: string; qrCodeUrl: string; manualEntryCode: string }>("/auth/2fa/setup"),
    onSuccess: (data) => { setSetupData(data); setSetupStep("qr"); },
    onError: () => toast({ title: "Failed to start 2FA setup", variant: "destructive" }),
  });

  const verifySetupMutation = useMutation({
    mutationFn: (token: string) => api.post<{ backupCodes: string[] }>("/auth/2fa/verify-setup", { token }),
    onSuccess: (data) => { setBackupCodes(data.backupCodes); setSetupStep("backup"); refetchTwoFA(); },
    onError: () => toast({ title: "Invalid code. Please try again.", variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: () => api.post("/auth/2fa/disable", { currentPassword: disablePassword, token: disableToken }),
    onSuccess: () => { setDisableDialog(false); setDisablePassword(""); setDisableToken(""); refetchTwoFA(); toast({ title: "2FA disabled" }); },
    onError: () => toast({ title: "Failed to disable 2FA. Check your password and code.", variant: "destructive" }),
  });

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hubforte-backup-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleConnect = async () => {
    try {
      const { data } = await getAuthUrl();
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Failed to start connection", description: err.message, variant: "destructive" });
    }
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Gmail disconnected" });
        queryClient.invalidateQueries({ queryKey: getGetGmailStatusQueryKey() });
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and integrations.</p>
      </div>

      {!isLoading && (
        gmailStatus?.connected ? (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-emerald-50 border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-900">Gmail connected as <strong>{gmailStatus.email}</strong></span>
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnectMutation.isPending} className="border-emerald-200 text-emerald-700 hover:bg-emerald-100">Disconnect</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-900">Gmail not connected — emails cannot be sent until you connect your Gmail account</span>
            </div>
            <Button size="sm" onClick={handleConnect} className="bg-amber-500 hover:bg-amber-600 text-white">Connect Gmail</Button>
          </div>
        )
      )}

      <div className="grid gap-6">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader><CardTitle className="text-lg">Profile Information</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xl font-bold">
                {user?.name?.charAt(0) || "U"}
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Role: {user?.role}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Mail className="h-5 w-5 text-gray-500" /> Email Integration</CardTitle>
            <CardDescription>Connect your Gmail account to send outreach campaigns directly from your own email address.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4">Checking connection status...</div>
            ) : gmailStatus?.connected ? (
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
                  <div>
                    <h4 className="font-semibold text-emerald-900">Connected to Gmail</h4>
                    <p className="text-sm text-emerald-700 mt-0.5">Sending as <span className="font-bold">{gmailStatus.email}</span></p>
                  </div>
                </div>
                <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-100" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>Disconnect</Button>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 p-6 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">Not Connected</h4>
                  <p className="text-sm text-gray-500 mt-0.5">Connect via OAuth to enable email sending.</p>
                </div>
                <Button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700">Connect Gmail</Button>
              </div>
            )}
            <div className="mt-6 flex items-start gap-3 text-sm text-gray-500 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
              <Shield className="h-5 w-5 text-blue-500 shrink-0" />
              <p>We only request permission to send emails on your behalf. We do not read your inbox, delete emails, or access your contacts from Google. Tokens are securely stored and encrypted.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Lock className="h-5 w-5 text-gray-500" /> Two-Factor Authentication</CardTitle>
            <CardDescription>Add an extra layer of security to your account using an authenticator app.</CardDescription>
          </CardHeader>
          <CardContent>
            {setupStep === "idle" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {twoFAStatus?.totpEnabled
                    ? <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Enabled</Badge>
                    : <Badge variant="secondary">Disabled</Badge>}
                  <span className="text-sm text-slate-500">{twoFAStatus?.totpEnabled ? "Your account is protected with 2FA." : "2FA is not enabled on your account."}</span>
                </div>
                {twoFAStatus?.totpEnabled
                  ? <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDisableDialog(true)}>Disable 2FA</Button>
                  : <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>{setupMutation.isPending ? "Setting up..." : "Enable 2FA"}</Button>}
              </div>
            )}

            {setupStep === "qr" && setupData && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password):</p>
                <div className="flex justify-center"><img src={setupData.qrCodeUrl} alt="QR Code" className="w-48 h-48 border rounded-lg" /></div>
                <p className="text-xs text-slate-500 text-center">Can't scan? Enter this code manually: <code className="font-mono bg-slate-100 px-1 rounded">{setupData.manualEntryCode}</code></p>
                <div className="flex gap-2">
                  <Input placeholder="Enter 6-digit code" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} maxLength={6} className="font-mono text-center tracking-widest" />
                  <Button onClick={() => verifySetupMutation.mutate(verifyCode)} disabled={verifyCode.length !== 6 || verifySetupMutation.isPending}>{verifySetupMutation.isPending ? "Verifying..." : "Confirm"}</Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSetupStep("idle")}>Cancel</Button>
              </div>
            )}

            {setupStep === "backup" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="w-5 h-5" /><span className="font-medium">2FA enabled successfully!</span></div>
                <p className="text-sm text-slate-600">Save these backup codes somewhere safe. Each can only be used once.</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-slate-50 border rounded-lg p-4">
                  {backupCodes.map(c => <span key={c} className="text-slate-700">{c}</span>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyBackupCodes}>{copied ? <><Check className="w-4 h-4 mr-1" />Copied</> : <><Copy className="w-4 h-4 mr-1" />Copy</>}</Button>
                  <Button variant="outline" size="sm" onClick={downloadBackupCodes}><Download className="w-4 h-4 mr-1" />Download</Button>
                </div>
                <Button onClick={() => setSetupStep("idle")}>Done</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-500" /> AI &amp; Intelligence</CardTitle>
            <CardDescription>
              {aiConfig?.configured
                ? `Using your own key (${aiConfig.provider} / ${aiConfig.maskedApiKey})`
                : `Using system default (${aiConfig?.defaultProvider || "openrouter"} / ${aiConfig?.defaultModel || "deepseek/deepseek-chat"})`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {aiUsage && aiUsage.source === "byok" && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Usage this month</span>
                  <span>${(aiUsage.usageThisMonth ?? 0).toFixed(2)} / ${aiUsage.monthlyBudgetUSD ?? 10}</span>
                </div>
                <Progress value={aiUsage.percentUsed ?? 0} className="h-2" />
              </div>
            )}

            {isAdmin && byokEnabled && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-sm font-medium text-gray-700">Bring Your Own Key (BYOK)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Provider</Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Model</Label>
                    <Input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="deepseek/deepseek-chat" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">API Key</Label>
                  <Input type="password" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} placeholder={aiConfig?.configured ? "Enter new key to replace" : "sk-..."} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Monthly Budget (USD)</Label>
                  <Input type="number" min={1} value={aiMonthlyBudget} onChange={e => setAiMonthlyBudget(Number(e.target.value))} />
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Feature Toggles</p>
                  {([
                    ["emailComposer", "Email Composer"],
                    ["contactSummary", "Contact Summary"],
                    ["leadScore", "Lead Scoring"],
                    ["nextBestAction", "Next Best Action"],
                    ["navHelper", "Navigation Helper"],
                  ] as [keyof typeof aiFeatures, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-sm text-gray-700">{label}</Label>
                      <Switch
                        checked={aiFeatures[key]}
                        onCheckedChange={v => setAiFeatures(f => ({ ...f, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveAiSettings} disabled={aiSaving} className="bg-purple-600 hover:bg-purple-700">
                    {aiSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save AI Settings"}
                  </Button>
                  <Button variant="outline" onClick={handleTestAiConnection} disabled={aiTesting}>
                    {aiTesting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</> : "Test Connection"}
                  </Button>
                  {aiConfig?.configured && (
                    <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={handleRemoveAiSettings}>
                      <Trash2 className="h-4 w-4 mr-1" />Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={disableDialog} onOpenChange={setDisableDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Disable Two-Factor Authentication</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Enter your password and current authenticator code to disable 2FA.</p>
              <Input type="password" placeholder="Current password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} />
              <Input placeholder="6-digit code" value={disableToken} onChange={e => setDisableToken(e.target.value)} maxLength={6} className="font-mono text-center tracking-widest" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisableDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => disableMutation.mutate()} disabled={!disablePassword || disableToken.length !== 6 || disableMutation.isPending}>
                {disableMutation.isPending ? "Disabling..." : "Disable 2FA"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
