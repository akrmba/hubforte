import { useEffect } from 'react';
import { Link } from "wouter";
import { logUserAction } from "../lib/analytics";
import { useState, useRef } from "react";
import { useListCampaigns, getListCampaignsQueryKey, useListContacts, getListContactsQueryKey } from "@workspace/api-client-react";
import { Mail, Plus, Play, Pause, AlertCircle, Paperclip, X, Eye, Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OutreachPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'OutreachPage' });
  }, []);

  const { toast } = useToast();

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<any>("/settings/ai"),
    staleTime: 5 * 60 * 1000,
  });
  const emailComposerEnabled = !aiConfig?.configured || aiConfig?.features?.emailComposer !== false;

  // --- Single send state ---
  const [selectedContactId, setSelectedContactId] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Composer state
  const [aiComposerOpen, setAiComposerOpen] = useState(false);
  const [aiAudience, setAiAudience] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiKeyMessage, setAiKeyMessage] = useState("");
  const [aiComposing, setAiComposing] = useState(false);

  const handleAiCompose = async () => {
    if (!aiAudience || !aiKeyMessage) {
      toast({ title: "Please fill in audience and key message", variant: "destructive" });
      return;
    }
    setAiComposing(true);
    try {
      const result = await api.post<any>("/ai/compose-email", { audience: aiAudience, tone: aiTone, keyMessage: aiKeyMessage });
      if (result.success) {
        setSubject(result.subject);
        setBody(result.body);
        setAiComposerOpen(false);
        setAiAudience(""); setAiKeyMessage("");
        toast({ title: "Email draft generated" });
      } else {
        toast({ title: "AI unavailable", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "AI unavailable", description: "Please write your email manually.", variant: "destructive" });
    } finally {
      setAiComposing(false);
    }
  };

  const { data: contactsData } = useListContacts({ limit: 200 }, {
    query: { queryKey: getListContactsQueryKey({ limit: 200 }) }
  });
  const contacts = Array.isArray(contactsData) ? contactsData : (contactsData as any)?.data ?? [];

  // --- Campaigns state ---
  const [page, setPage] = useState(1);
  const { data: campaignsResponse, isLoading } = useListCampaigns({ page, limit: 25 } as any, {
    query: { queryKey: [...getListCampaignsQueryKey({}), page] }
  });
  const campaigns = Array.isArray(campaignsResponse) ? campaignsResponse : (campaignsResponse as any)?.data ?? [];
  const totalPages = Array.isArray(campaignsResponse) ? 1 : (campaignsResponse as any)?.totalPages ?? 1;
  const currentPage = Array.isArray(campaignsResponse) ? 1 : (campaignsResponse as any)?.page ?? 1;

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    const contact = contacts.find((c: any) => c.id === contactId);
    if (contact) setToEmail(contact.email);
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: `${f.name} exceeds 10MB limit`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setAttachments((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > 3) {
        toast({ title: "Maximum 3 attachments allowed", variant: "destructive" });
        return combined.slice(0, 3);
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePreview = async () => {
    if (!selectedContactId) {
      toast({ title: "Select a contact first to preview personalisation", variant: "destructive" });
      return;
    }
    setLoadingPreview(true);
    try {
      const result = await api.post<{ subject: string; body: string }>("/outreach/preview", {
        contactId: selectedContactId,
        subject,
        body,
      });
      setPreview(result);
      setPreviewOpen(true);
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSend = async () => {
    if (!selectedContactId || !toEmail || !subject || !body) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("contactId", selectedContactId);
      formData.append("to", toEmail);
      formData.append("subject", subject);
      formData.append("body", body);
      for (const file of attachments) {
        formData.append("attachments", file);
      }
      await api.postFormData("/outreach/send", formData);
      toast({ title: "Email sent successfully" });
      setSelectedContactId("");
      setToEmail("");
      setSubject("");
      setBody("");
      setAttachments([]);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-700';
      case 'SCHEDULED': return 'bg-blue-100 text-blue-700';
      case 'SENDING': return 'bg-amber-100 text-amber-700';
      case 'SENT': return 'bg-emerald-100 text-emerald-700';
      case 'PAUSED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Single Send */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Send Email</h1>
        <p className="text-sm text-gray-500 mt-1">Send a single email to a contact.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Contact</label>
            <Select value={selectedContactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a contact..." />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} — {c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To (email)</label>
            <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="recipient@example.com" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Hello {{firstName}}" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium">Body</label>
            {emailComposerEnabled && (
              <Button variant="outline" size="sm" onClick={() => setAiComposerOpen(true)} className="text-purple-600 border-purple-200 hover:bg-purple-50 h-7 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />Generate with AI
              </Button>
            )}
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Hi {{firstName}},\n\n..."}
            className="min-h-[180px] font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Use {"{{firstName}}"}, {"{{lastName}}"}, {"{{organisationName}}"} for personalisation
          </p>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium mb-1">Attachments</label>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((file, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 rounded-full px-3 py-1 text-xs font-medium">
                <Paperclip className="h-3 w-3 text-gray-500" />
                {file.name}
                <span className="text-gray-400">({formatFileSize(file.size)})</span>
                <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500 ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {attachments.length < 3 && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  multiple
                  onChange={handleFileAdd}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-3 w-3 mr-1" /> Add file
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Up to 3 files, max 10 MB each. PDF, DOCX, XLSX, PNG, JPG.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSend} disabled={sending || !selectedContactId || !subject || !body}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={loadingPreview || !selectedContactId || !subject || !body}>
            <Eye className="h-4 w-4 mr-2" />
            {loadingPreview ? "Loading..." : "Preview"}
          </Button>
        </div>
      </div>

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Subject</p>
                <p className="text-sm font-semibold text-gray-900 bg-gray-50 rounded p-2">{preview.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Body</p>
                <pre className="text-sm text-gray-800 bg-gray-50 rounded p-3 whitespace-pre-wrap font-sans">{preview.body}</pre>
              </div>
              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Attachments</p>
                  <div className="flex flex-wrap gap-1.5">
                    {attachments.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Paperclip className="h-3 w-3 mr-1" /> {f.name} ({formatFileSize(f.size)})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Campaigns */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">Manage email outreach campaigns.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/outreach/templates">
            <Button variant="outline">Manage Templates</Button>
          </Link>
          <Link href="/outreach/campaigns/new">
            <Button><Plus className="h-4 w-4 mr-2" /> New Campaign</Button>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Campaign Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                  <Mail className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-900">No campaigns yet</p>
                  <Link href="/outreach/campaigns/new" className="text-sm text-blue-600 hover:underline mt-1 inline-block">Create your first campaign</Link>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign: any) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium text-gray-900">
                    <Link href={`/outreach/campaigns/${campaign.id}`} className="hover:text-blue-600 hover:underline">
                      {campaign.name}
                    </Link>
                    <div className="text-xs text-gray-500 font-normal mt-0.5">{campaign.subject}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`uppercase text-[10px] font-bold ${getStatusColor(campaign.status)}`}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[200px]">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{campaign.sentCount} / {campaign.contactCount}</span>
                      <span>{campaign.contactCount > 0 ? Math.round((campaign.sentCount / campaign.contactCount) * 100) : 0}%</span>
                    </div>
                    <Progress value={campaign.contactCount > 0 ? (campaign.sentCount / campaign.contactCount) * 100 : 0} className="h-2" />
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {campaign.scheduledAt ? format(new Date(campaign.scheduledAt), "MMM d, yyyy HH:mm") : "Immediate"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/outreach/campaigns/${campaign.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="px-4 text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* AI Email Composer Dialog */}
      <Dialog open={aiComposerOpen} onOpenChange={setAiComposerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-500" />Generate Email with AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Target audience</label>
              <Input value={aiAudience} onChange={e => setAiAudience(e.target.value)} placeholder="e.g. School headteachers in London" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tone</label>
              <Select value={aiTone} onValueChange={setAiTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Key message</label>
              <Input value={aiKeyMessage} onChange={e => setAiKeyMessage(e.target.value)} placeholder="e.g. Invite them to our spring programme" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAiCompose} disabled={aiComposing} className="bg-purple-600 hover:bg-purple-700 flex-1">
                {aiComposing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : "Generate Draft"}
              </Button>
              <Button variant="outline" onClick={() => setAiComposerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
