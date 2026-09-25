import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useRoute, useLocation } from "wouter";
import { 
  useGetContact, 
  getGetContactQueryKey, 
  useUpdateContact, 
  useDeleteContact,
  useCreateActivity,
  useCreateTask,
  useCreateNote,
  useDeleteNote,
  useSendEmail,
  getListContactsQueryKey,
  useListTemplates,
  getListTemplatesQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Phone, Building2, User, Activity as ActivityIcon, Edit, Trash2, Plus, Calendar, CheckSquare, FileText, Send, UserCheck, TrendingUp, LifeBuoy, Sparkles, ExternalLink, Loader2, Copy, X, MoreVertical, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import NotFound from "@/pages/not-found";

const noteSchema = z.object({
  content: z.string().min(1, "Note content is required")
});

const emailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message body is required"),
  templateId: z.string().optional()
});

const activitySchema = z.object({
  type: z.string().min(1, "Type is required"),
  summary: z.string().min(1, "Summary is required"),
});

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  priority: z.string().min(1, "Priority is required"),
});

export default function ContactDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'ContactDetailPage' });
  }, []);

  const [, params] = useRoute("/contacts/:id");
  const id = params?.id || "";
  const [, setLocation] = useLocation();
  const { isViewer, isManager, isAdmin, canSendOutreach } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contact, isLoading } = useGetContact(id, {
    query: { enabled: !!id, queryKey: getGetContactQueryKey(id) }
  });

  const deleteMutation = useDeleteContact();
  const createNoteMutation = useCreateNote();
  const deleteNoteMutation = useDeleteNote();
  const sendEmailMutation = useSendEmail();
  const createActivityMutation = useCreateActivity();
  const createTaskMutation = useCreateTask();

  const [isEmailSheetOpen, setIsEmailSheetOpen] = useState(false);
  const [isActivitySheetOpen, setIsActivitySheetOpen] = useState(false);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<{ summary?: string; nextAction?: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // AI Draft Email state
  const [isDraftEmailOpen, setIsDraftEmailOpen] = useState(false);
  const [draftContext, setDraftContext] = useState("");
  const [draftTone, setDraftTone] = useState("professional");
  const [draftResult, setDraftResult] = useState<{ subject?: string; body?: string } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // AI Summary state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // AI Suggest Next Action state
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);

  // Clean Contact Data state
  const [isCleanDataOpen, setIsCleanDataOpen] = useState(false);
  const [cleanDataResult, setCleanDataResult] = useState<any>(null);
  const [cleanDataLoading, setCleanDataLoading] = useState(false);

  const { data: volunteerData } = useQuery({
    queryKey: ["volunteer-by-contact", id],
    queryFn: () => api.get(`/volunteers?contactId=${id}&limit=1`),
    enabled: !!id,
    retry: false,
  });

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<any>("/settings/ai"),
    staleTime: 5 * 60 * 1000,
  });
  const emailComposerEnabled = !aiConfig?.configured || aiConfig?.features?.emailComposer !== false;
  const contactSummaryEnabled = !aiConfig?.configured || aiConfig?.features?.contactSummary !== false;
  const leadScoreEnabled = !aiConfig?.configured || aiConfig?.features?.leadScore !== false;
  const nextBestActionEnabled = !aiConfig?.configured || aiConfig?.features?.nextBestAction !== false;

  const { data: opportunitiesData } = useQuery({
    queryKey: ["contact-opportunities", id],
    queryFn: () => api.get(`/opportunities?contactId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: ticketsData } = useQuery({
    queryKey: ["contact-tickets", id],
    queryFn: () => api.get(`/support/tickets?contactId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: templates } = useListTemplates({
    query: { queryKey: getListTemplatesQueryKey() }
  });

  const noteForm = useForm<z.infer<typeof noteSchema>>({
    resolver: zodResolver(noteSchema as any),
    defaultValues: { content: "" }
  });

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema as any),
    defaultValues: { subject: "", body: "", templateId: "none" }
  });

  const activityForm = useForm<z.infer<typeof activitySchema>>({
    resolver: zodResolver(activitySchema as any),
    defaultValues: { type: "NOTE", summary: "" }
  });

  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema as any),
    defaultValues: { title: "", description: "", dueDate: "", priority: "MEDIUM" }
  });

  const onNoteSubmit = (values: z.infer<typeof noteSchema>) => {
    createNoteMutation.mutate({ data: { content: values.content, contactId: id } }, {
      onSuccess: () => {
        toast({ title: "Note added" });
        noteForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      }
    });
  };

  const onActivitySubmit = (values: z.infer<typeof activitySchema>) => {
    if (!contact) return;
    createActivityMutation.mutate({ 
      data: { 
        ...values, 
        contactId: id,
        organizationId: contact.organizationId
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Activity logged" });
        setIsActivitySheetOpen(false);
        activityForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      }
    });
  };

  const onTaskSubmit = (values: z.infer<typeof taskSchema>) => {
    if (!contact) return;
    createTaskMutation.mutate({ 
      data: { 
        ...values, 
        contactId: id,
        organizationId: contact.organizationId
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Task created" });
        setIsTaskSheetOpen(false);
        taskForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      }
    });
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate({ id: noteId }, {
      onSuccess: () => {
        toast({ title: "Note deleted" });
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      }
    });
  };

  const onEmailSubmit = (values: z.infer<typeof emailSchema>) => {
    if (!contact) return;
    sendEmailMutation.mutate({
      data: {
        contactId: id,
        to: contact.email,
        subject: values.subject,
        body: values.body,
        templateId: values.templateId !== "none" ? values.templateId : undefined
      }
    }, {
      onSuccess: () => {
        toast({ title: "Email sent" });
        setIsEmailSheetOpen(false);
        emailForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      },
      onError: (err) => {
        toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Contact deleted" });
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setLocation("/contacts");
      }
    });
  };

  const getContactHistory = () => {
    if (!contact) return "No activities yet";
    return contact.activities?.map((a: any) => `${a.type}: ${a.summary}`).join(". ") || "No activities yet";
  };

  const getContactFullName = () => contact ? `${contact.firstName} ${contact.lastName}` : "";

  const handleAiError = (e: any) => {
    const msg = e?.message || "";
    if (msg.includes("OPENAI_API_KEY") || msg.includes("AI features")) {
      toast({ title: "AI features are not configured", description: "Please contact your administrator.", variant: "destructive" });
    } else {
      toast({ title: "AI unavailable", description: msg || "Something went wrong.", variant: "destructive" });
    }
  };

  const handleDraftEmail = async () => {
    if (!contact || !draftContext.trim()) return;
    setDraftLoading(true);
    setDraftResult(null);
    try {
      const res = await api.post<any>("/ai/compose-email", {
        audience: `${contact.firstName} ${contact.lastName}`,
        tone: draftTone,
        keyMessage: draftContext,
      });
      if (res.success && res.subject && res.body) {
        setDraftResult({ subject: res.subject, body: res.body });
      } else {
        throw new Error(res.error || "Failed to generate draft");
      }
    } catch (e: any) {
      handleAiError(e);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSummarise = async () => {
    if (!contact) return;
    setAiSummaryLoading(true);
    try {
      const res = await api.post<any>(`/ai/contact-summary/${contact.id}`, {});
      if (res.success && res.summary) {
        setAiSummary(res.summary);
      } else {
        throw new Error(res.error || "Failed to generate summary");
      }
    } catch (e: any) {
      handleAiError(e);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleSuggestAction = async () => {
    if (!contact) return;
    setAiSuggestionLoading(true);
    try {
      const res = await api.post<any>(`/ai/next-best-action/${contact.id}`, {});
      if (res.success && res.action) {
        setAiSuggestion(res.action);
      } else {
        throw new Error(res.error || "Failed to generate suggestion");
      }
    } catch (e: any) {
      handleAiError(e);
    } finally {
      setAiSuggestionLoading(false);
    }
  };

  // Phase 10: new AI endpoints
  const handleContactSummary = async () => {
    if (!contact) return;
    setAiSummaryLoading(true);
    try {
      const res = await api.post<any>(`/ai/contact-summary/${contact.id}`, {});
      if (res.success && res.summary) {
        setAiSummary(res.summary);
      } else {
        throw new Error(res.error || "AI unavailable");
      }
    } catch (e: any) {
      handleAiError(e);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const [leadScoreLoading, setLeadScoreLoading] = useState(false);
  const [leadScoreResult, setLeadScoreResult] = useState<{ score: number; label: string; explanation: string } | null>(
    contact?.leadScore != null ? { score: contact.leadScore, label: contact.leadScoreLabel ?? "", explanation: contact.leadScoreExplanation ?? "" } : null
  );

  const handleScoreLead = async () => {
    if (!contact) return;
    setLeadScoreLoading(true);
    try {
      const res = await api.post<any>(`/ai/score-lead/${contact.id}`, {});
      if (res.success) {
        setLeadScoreResult({ score: res.score, label: res.label, explanation: res.explanation });
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      } else {
        toast({ title: "Lead scoring failed", description: res.error, variant: "destructive" });
      }
    } catch (e: any) {
      const msg = e?.message || "Lead scoring failed";
      toast({ title: "Lead scoring failed", description: msg, variant: "destructive" });
    } finally {
      setLeadScoreLoading(false);
    }
  };

  const handleNextBestAction = async () => {
    if (!contact) return;
    setAiSuggestionLoading(true);
    try {
      const res = await api.post<any>(`/ai/next-best-action/${contact.id}`, {});
      if (res.success && res.action) {
        setAiSuggestion(res.action);
      } else {
        throw new Error(res.error || "AI unavailable");
      }
    } catch (e: any) {
      handleAiError(e);
    } finally {
      setAiSuggestionLoading(false);
    }
  };

  const handleCleanData = async () => {
    if (!contact) return;
    setCleanDataLoading(true);
    setCleanDataResult(null);
    setIsCleanDataOpen(true);
    try {
      const contactData = { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, role: contact.role, status: contact.status };
      const res = await api.post<any>("/ai/clean-data", { contacts: [contactData] });
      if (res.success && res.result) {
        setCleanDataResult(res.result);
      } else {
        throw new Error(res.error || "Failed to check data quality");
      }
    } catch (e: any) {
      setIsCleanDataOpen(false);
      handleAiError(e);
    } finally {
      setCleanDataLoading(false);
    }
  };

  const handleCopyDraft = () => {
    if (!draftResult) return;
    const text = `Subject: ${draftResult.subject}\n\n${draftResult.body}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Draft copied to clipboard" });
  };

  const handleUseInOutreach = () => {
    if (!draftResult) return;
    sessionStorage.setItem("ai-draft-email", JSON.stringify({ to: contact?.email, subject: draftResult.subject, body: draftResult.body }));
    setIsDraftEmailOpen(false);
    setLocation("/outreach");
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'PROSPECT': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'UNSUBSCRIBED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-32 w-full mb-6" /><Skeleton className="h-64 w-full" /></div>;
  if (!contact) return <NotFound />;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-2xl font-bold border border-indigo-200">
            {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{contact.firstName} {contact.lastName}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={`text-xs uppercase ${getStatusColor(contact.status)}`}>{contact.status}</Badge>
              {contact.role && <span className="text-sm text-gray-600">{contact.role}</span>}
              {contact.organizationName && (
                <Link href={`/organizations/${contact.organizationId}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                  at <Building2 className="h-3.5 w-3.5" /> {contact.organizationName}
                </Link>
              )}
              {/* Lead Score Badge */}
              {(leadScoreResult || contact.leadScore != null) && (() => {
                const score = leadScoreResult?.score ?? contact.leadScore ?? 0;
                const label = leadScoreResult?.label ?? contact.leadScoreLabel ?? "";
                const color = score <= 30 ? "bg-blue-100 text-blue-800 border-blue-200"
                  : score <= 60 ? "bg-amber-100 text-amber-800 border-amber-200"
                  : score <= 80 ? "bg-orange-100 text-orange-800 border-orange-200"
                  : "bg-green-100 text-green-800 border-green-200";
                return (
                  <Badge variant="outline" className={`text-xs ${color}`} title={leadScoreResult?.explanation ?? contact.leadScoreExplanation ?? ""}>
                    <TrendingUp className="h-3 w-3 mr-1" />{label} {score}/100
                  </Badge>
                );
              })()}
              {contactSummaryEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 border-violet-200 text-violet-700 hover:bg-violet-50"
                  onClick={handleContactSummary}
                  disabled={aiSummaryLoading}
                >
                  {aiSummaryLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  AI Summary
                </Button>
              )}
              {leadScoreEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-violet-200 text-violet-700 hover:bg-violet-50"
                  onClick={handleScoreLead}
                  disabled={leadScoreLoading}
                >
                  {leadScoreLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5 mr-1" />}
                  Score Lead
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canSendOutreach && (
            <>
              <Sheet open={isEmailSheetOpen} onOpenChange={setIsEmailSheetOpen}>
                <SheetTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Send className="h-4 w-4 mr-2" /> Send Email
                  </Button>
                </SheetTrigger>
              <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Compose Email</SheetTitle>
                  <SheetDescription>Send an email to {contact.firstName} {contact.lastName}.</SheetDescription>
                </SheetHeader>
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">To</label>
                      <Input value={contact.email} disabled />
                    </div>
                    
                    <FormField control={emailForm.control} name="templateId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template</FormLabel>
                        <Select 
                          onValueChange={(val) => {
                            field.onChange(val);
                            const tpl = templates?.find((t) => t.id === val);
                            if (tpl) {
                              emailForm.setValue("subject", tpl.subject);
                              emailForm.setValue("body", tpl.body);
                            }
                          }} 
                          value={field.value}
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a template (optional)" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">No template</SelectItem>
                            {templates?.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />

                    <FormField control={emailForm.control} name="subject" render={({ field }) => (
                      <FormItem><FormLabel>Subject *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <FormField control={emailForm.control} name="body" render={({ field }) => (
                      <FormItem><FormLabel>Message *</FormLabel><FormControl><Textarea className="min-h-[250px]" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <div className="pt-4 flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsEmailSheetOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={sendEmailMutation.isPending}>
                        {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
              {emailComposerEnabled && (
                <Button
                  variant="outline"
                  className="border-violet-200 text-violet-700 hover:bg-violet-50"
                  onClick={() => setIsDraftEmailOpen(true)}
                >
                  <Sparkles className="h-4 w-4 mr-2" /> AI Draft
                </Button>
              )}
            </>
          )}

          {!isViewer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCleanData}>
                  <Sparkles className="h-4 w-4 mr-2 text-violet-600" /> Check Data Quality
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isViewer && (
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          
          {(isManager || isAdmin) && !isViewer && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this contact. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* AI Summary Panel */}
      {aiSummary && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">AI Generated Summary</span>
              <span className="text-[10px] text-violet-500">{new Date().toLocaleString()}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-violet-400 hover:text-violet-700" onClick={() => setAiSummary(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-violet-900 whitespace-pre-wrap">{aiSummary}</p>
        </div>
      )}

      {/* AI Draft Email Dialog */}
      <Dialog open={isDraftEmailOpen} onOpenChange={(open) => { setIsDraftEmailOpen(open); if (!open) { setDraftResult(null); setDraftContext(""); setDraftTone("professional"); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> AI Draft Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Recipient</label>
              <Input value={`${contact.firstName} ${contact.lastName} <${contact.email}>`} disabled className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Context</label>
              <Textarea
                placeholder="e.g. Following up on our meeting last week..."
                value={draftContext}
                onChange={(e) => setDraftContext(e.target.value)}
                className="mt-1 min-h-[80px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Tone</label>
              <Select value={draftTone} onValueChange={setDraftTone}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!draftResult && (
              <Button
                onClick={handleDraftEmail}
                disabled={draftLoading || !draftContext.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700"
              >
                {draftLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating draft...</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate Draft</>}
              </Button>
            )}
            {draftResult && (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Subject</label>
                  <p className="text-sm font-medium text-gray-900 mt-1">{draftResult.subject}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Body</label>
                  <div className="mt-1 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border whitespace-pre-wrap max-h-[250px] overflow-y-auto">{draftResult.body}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCopyDraft} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
                  </Button>
                  <Button onClick={handleUseInOutreach} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    <Send className="h-4 w-4 mr-2" /> Use in Outreach
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Clean Contact Data Dialog */}
      <Dialog open={isCleanDataOpen} onOpenChange={setIsCleanDataOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> Data Quality Check</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 font-medium">{contact.firstName} {contact.lastName}</p>
          {cleanDataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              <span className="ml-2 text-sm text-gray-500">Analyzing data quality...</span>
            </div>
          ) : cleanDataResult ? (
            <div className="space-y-3">
              {cleanDataResult.issues && cleanDataResult.issues.length > 0 ? (
                cleanDataResult.issues.map((issue: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <p className="text-sm font-medium text-gray-900">{issue.description || issue}</p>
                    {issue.suggestedFix && <p className="text-xs text-gray-600 mt-1">Fix: {issue.suggestedFix}</p>}
                    {issue.severity && <Badge variant="outline" className="mt-1 text-[10px]">{issue.severity}</Badge>}
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <ClipboardCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-emerald-700">No data quality issues found</p>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCleanDataOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</label>
                <div className="text-sm text-gray-900 mt-1">
                  <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>
                </div>
              </div>
              {contact.phone && (
                <div>
                  <label className="text-xs text-gray-500 font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</label>
                  <div className="text-sm text-gray-900 mt-1">{contact.phone}</div>
                </div>
              )}
              <div className="pt-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Last Contacted</span>
                  <span className="text-gray-900 font-medium">{contact.lastContactedAt ? formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true }) : "Never"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Owner</span>
                  <span className="text-gray-900 font-medium">{contact.ownerName || "Unassigned"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Tasks</CardTitle>
              <div className="flex items-center gap-1">
                {nextBestActionEnabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                    onClick={handleNextBestAction}
                    disabled={aiSuggestionLoading}
                    title="Next Best Action"
                  >
                    {aiSuggestionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </Button>
                )}
              {!isViewer && (
                <Sheet open={isTaskSheetOpen} onOpenChange={setIsTaskSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
                  </SheetTrigger>
                  <SheetContent className="sm:max-w-md overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Create Task</SheetTitle>
                      <SheetDescription>Add a new task for {contact.firstName}.</SheetDescription>
                    </SheetHeader>
                    <Form {...taskForm}>
                      <form onSubmit={taskForm.handleSubmit(onTaskSubmit)} className="space-y-4 mt-4">
                        <FormField control={taskForm.control} name="title" render={({ field }) => (
                          <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={taskForm.control} name="description" render={({ field }) => (
                          <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={taskForm.control} name="dueDate" render={({ field }) => (
                            <FormItem><FormLabel>Due Date *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={taskForm.control} name="priority" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="LOW">Low</SelectItem>
                                  <SelectItem value="MEDIUM">Medium</SelectItem>
                                  <SelectItem value="HIGH">High</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                        <div className="pt-4 flex justify-end">
                          <Button type="submit" disabled={createTaskMutation.isPending}>
                            {createTaskMutation.isPending ? "Saving..." : "Save Task"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </SheetContent>
                </Sheet>
              )}
              </div>
            </CardHeader>
            <CardContent>
              {aiSuggestion && (
                <div className="mb-3 p-3 rounded-lg border border-violet-200 bg-violet-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                    <span className="text-xs font-semibold text-violet-700 uppercase">AI Suggested Action</span>
                  </div>
                  <p className="text-sm text-violet-900 mb-3">{aiSuggestion}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-violet-200 text-violet-700 hover:bg-violet-100"
                      onClick={() => {
                        taskForm.setValue("title", aiSuggestion.length > 100 ? aiSuggestion.slice(0, 100) + "..." : aiSuggestion);
                        setIsTaskSheetOpen(true);
                        setAiSuggestion(null);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create Task
                    </Button>
                    <Button size="sm" variant="ghost" className="text-gray-500" onClick={() => setAiSuggestion(null)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {contact.tasks.length === 0 ? (
                  <div className="text-center py-4 text-sm text-gray-500">No pending tasks</div>
                ) : (
                  contact.tasks.map(task => {
                    const isOverdue = task.status !== "DONE" && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                    return (
                      <div key={task.id} className={`p-3 rounded-lg border text-sm ${isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className={`font-medium text-gray-900 ${task.status === 'DONE' ? 'line-through text-gray-500' : ''}`}>{task.title}</div>
                        <div className={`mt-1 text-xs flex justify-between items-center ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                          <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                          <Badge variant="outline" className="text-[9px] uppercase">{task.status}</Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="activity">
            <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
              <TabsTrigger value="activity">Activity & Emails</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="volunteer" className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Volunteer</TabsTrigger>
              <TabsTrigger value="opportunities" className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Opportunities</TabsTrigger>
              <TabsTrigger value="tickets" className="flex items-center gap-1"><LifeBuoy className="h-3.5 w-3.5" /> Tickets</TabsTrigger>
              {(contactSummaryEnabled || nextBestActionEnabled) && (
                <TabsTrigger value="ai" className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI Insights</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="activity" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
                {!isViewer && (
                  <Sheet open={isActivitySheetOpen} onOpenChange={setIsActivitySheetOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm" variant="outline"><ActivityIcon className="h-4 w-4 mr-2" /> Log Activity</Button>
                    </SheetTrigger>
                    <SheetContent className="sm:max-w-md overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Log Activity</SheetTitle>
                        <SheetDescription>Record an interaction with {contact.firstName}.</SheetDescription>
                      </SheetHeader>
                      <Form {...activityForm}>
                        <form onSubmit={activityForm.handleSubmit(onActivitySubmit)} className="space-y-4 mt-4">
                          <FormField control={activityForm.control} name="type" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Activity Type *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="NOTE">Note</SelectItem>
                                  <SelectItem value="CALL">Call</SelectItem>
                                  <SelectItem value="MEETING">Meeting</SelectItem>
                                  <SelectItem value="EMAIL">Email</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={activityForm.control} name="summary" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Summary *</FormLabel>
                              <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="pt-4 flex justify-end">
                            <Button type="submit" disabled={createActivityMutation.isPending}>
                              {createActivityMutation.isPending ? "Saving..." : "Save Activity"}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
              
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:ml-[1.2rem] md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                {contact.activities.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 ml-10">No activity recorded yet.</div>
                ) : (
                  contact.activities.map((activity) => (
                    <div key={activity.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-indigo-50 text-indigo-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {activity.type === 'EMAIL' && <Mail className="h-4 w-4" />}
                        {activity.type === 'NOTE' && <FileText className="h-4 w-4" />}
                        {activity.type === 'CALL' && <Phone className="h-4 w-4" />}
                        {(activity.type !== 'EMAIL' && activity.type !== 'NOTE' && activity.type !== 'CALL') && <ActivityIcon className="h-4 w-4" />}
                      </div>
                      <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-indigo-600 capitalize">{activity.type.toLowerCase()}</span>
                          <span className="text-xs text-gray-500">{new Date(activity.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-900 mt-2">{activity.summary}</p>
                      </Card>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="notes" className="space-y-4">
              {!isViewer && (
                <Card className="bg-blue-50/50 border-blue-100">
                  <CardContent className="p-4">
                    <Form {...noteForm}>
                      <form onSubmit={noteForm.handleSubmit(onNoteSubmit)}>
                        <FormField control={noteForm.control} name="content" render={({ field }) => (
                          <FormItem>
                            <FormControl><Textarea placeholder="Add a new note..." className="bg-white border-blue-200" {...field} /></FormControl>
                          </FormItem>
                        )} />
                        <div className="flex justify-end mt-3">
                          <Button type="submit" size="sm" disabled={createNoteMutation.isPending}>
                            {createNoteMutation.isPending ? "Saving..." : "Save Note"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-4 mt-6">
                {contact.notes.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">No notes yet.</div>
                ) : (
                  contact.notes.map(note => (
                    <Card key={note.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                              {note.authorName?.charAt(0) || "U"}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{note.authorName}</span>
                            <span className="text-xs text-gray-500">{formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                          </div>
                          {!isViewer && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-600" onClick={() => handleDeleteNote(note.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="volunteer" className="space-y-4">
              {(() => {
                const volunteers = Array.isArray((volunteerData as any)?.volunteers) ? (volunteerData as any).volunteers : (Array.isArray(volunteerData) ? volunteerData : []);
                const vol = volunteers.find((v: any) => v.contactId === id) || volunteers[0];
                if (!vol) {
                  return (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <UserCheck className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">Not a registered volunteer</p>
                        <p className="text-xs text-gray-500 mt-1">Add them as a volunteer from the Volunteers page.</p>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4" /> Volunteer Record</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">DBS Status</span>
                        <Badge variant="outline" className={`text-xs ${vol.dbsStatus === 'CLEAR' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : vol.dbsStatus === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {vol.dbsStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Compliance</span>
                        <Badge variant="outline" className={`text-xs ${vol.compliance === 'COMPLIANT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : vol.compliance === 'EXPIRING_SOON' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {vol.compliance}
                        </Badge>
                      </div>
                      {vol.dbsExpiresAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">DBS Expires</span>
                          <span className="text-sm text-gray-900">{new Date(vol.dbsExpiresAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      {vol.skills?.length > 0 && (
                        <div>
                          <span className="text-sm text-gray-500">Skills</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {vol.skills.map((s: string) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                          </div>
                        </div>
                      )}
                      {vol.availability && (
                        <div>
                          <span className="text-sm text-gray-500">Availability</span>
                          <p className="text-sm text-gray-900 mt-1">{vol.availability}</p>
                        </div>
                      )}
                      <div className="pt-2 border-t">
                        <a href={`/volunteers/${vol.id}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                          View full volunteer record <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </TabsContent>

            <TabsContent value="opportunities" className="space-y-4">
              {(() => {
                const opps = Array.isArray((opportunitiesData as any)?.opportunities) ? (opportunitiesData as any).opportunities : (Array.isArray(opportunitiesData) ? opportunitiesData : []);
                if (opps.length === 0) {
                  return (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <TrendingUp className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">No linked opportunities</p>
                        <p className="text-xs text-gray-500 mt-1">Opportunities linked to this contact will appear here.</p>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <div className="space-y-3">
                    {opps.map((opp: any) => (
                      <Card key={opp.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{opp.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{opp.stage}</Badge>
                              {opp.value && <span className="text-xs text-gray-500">£{Number(opp.value).toLocaleString()}</span>}
                            </div>
                          </div>
                          <a href={`/pipeline/${opp.id}`} className="text-blue-600 hover:text-blue-800">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="tickets" className="space-y-4">
              {(() => {
                const tickets = Array.isArray((ticketsData as any)?.tickets) ? (ticketsData as any).tickets : (Array.isArray(ticketsData) ? ticketsData : []);
                if (tickets.length === 0) {
                  return (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <LifeBuoy className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">No support tickets</p>
                        <p className="text-xs text-gray-500 mt-1">Support tickets for this contact will appear here.</p>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <div className="space-y-3">
                    {tickets.map((ticket: any) => (
                      <Card key={ticket.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{ticket.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-400">{ticket.ticketNumber}</span>
                              <Badge variant="outline" className="text-xs">{ticket.status}</Badge>
                              <Badge variant="outline" className={`text-xs ${ticket.priority === 'HIGH' || ticket.priority === 'URGENT' ? 'bg-red-50 text-red-700 border-red-200' : ''}`}>{ticket.priority}</Badge>
                            </div>
                          </div>
                          <a href={`/support/tickets/${ticket.id}`} className="text-blue-600 hover:text-blue-800">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="ai" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> AI Relationship Insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Generate an AI-powered summary of your relationship with {contact?.firstName} and get suggested next actions.
                  </p>
                  <Button
                    onClick={async () => {
                      if (!contact) return;
                      setAiLoading(true);
                      setAiInsight(null);
                      try {
                        const [summaryRes, actionRes] = await Promise.all([
                          contactSummaryEnabled ? api.post<any>(`/ai/contact-summary/${contact.id}`, {}) : Promise.resolve(null),
                          nextBestActionEnabled ? api.post<any>(`/ai/next-best-action/${contact.id}`, {}) : Promise.resolve(null),
                        ]);
                        const summaryError = summaryRes && !summaryRes.success ? summaryRes.error : null;
                        const actionError = actionRes && !actionRes.success ? actionRes.error : null;
                        const firstError = summaryError || actionError;
                        if (firstError) {
                          handleAiError({ message: firstError });
                        }
                        setAiInsight({
                          summary: summaryRes?.success ? summaryRes.summary ?? undefined : undefined,
                          nextAction: actionRes?.success ? actionRes.action ?? undefined : undefined,
                        });
                      } catch (e: any) {
                        handleAiError(e);
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                    disabled={aiLoading}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate Insights</>}
                  </Button>
                  {aiInsight && (
                    <div className="space-y-4 pt-2">
                      {aiInsight.summary && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Relationship Summary</h4>
                          <p className="text-sm text-gray-700 bg-violet-50 p-3 rounded-lg border border-violet-100 whitespace-pre-wrap">{aiInsight.summary}</p>
                        </div>
                      )}
                      {aiInsight.nextAction && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Suggested Next Action</h4>
                          <p className="text-sm text-gray-700 bg-emerald-50 p-3 rounded-lg border border-emerald-100 whitespace-pre-wrap">{aiInsight.nextAction}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
