import { useEffect } from 'react';
import { useState, useMemo } from "react";
import { logUserAction } from "../lib/analytics";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListTemplates, getListTemplatesQueryKey, useListContacts, getListContactsQueryKey, useCreateCampaign, useSendCampaign } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, X, Calendar, Send, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

export default function NewCampaignPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'NewCampaignPage' });
  }, []);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState("");

  const { data: templates } = useListTemplates({ query: { queryKey: getListTemplatesQueryKey() } });
  
  // Step 2 Contacts state
  const [search, setSearch] = useState("");
  const { data: contactsData } = useListContacts({ search, limit: 50 }, { 
    query: { queryKey: getListContactsQueryKey({ search, limit: 50 }) } 
  });

  const createMutation = useCreateCampaign();
  const sendMutation = useSendCampaign();

  const handleTemplateSelect = (id: string) => {
    const tpl = templates?.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBodyTemplate(tpl.body);
    }
  };

  const handleLaunch = async () => {
    try {
      const campaign = await createMutation.mutateAsync({
        data: {
          name,
          subject,
          bodyTemplate,
          contactIds: selectedContacts,
          scheduledAt: scheduleMode === "later" ? new Date(scheduledDate).toISOString() : undefined
        }
      });
      
      if (scheduleMode === "now") {
        await sendMutation.mutateAsync({ id: campaign.id, data: {} });
        toast({ title: "Campaign launched successfully" });
      } else {
        toast({ title: "Campaign scheduled successfully" });
      }
      
      setLocation(`/outreach/campaigns/${campaign.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    }
  };

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const addAllMatching = () => {
    if (contactsData?.data) {
      const ids = contactsData.data.map(c => c.id);
      setSelectedContacts(Array.from(new Set([...selectedContacts, ...ids])));
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Campaign</h1>
          <p className="text-sm text-gray-500 mt-1">Step {step} of 4</p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-2 w-12 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>
      
      <div className="bg-white p-6 md:p-8 rounded-xl border border-gray-200 shadow-sm">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold border-b pb-2">1. Campaign Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Campaign Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q3 Investor Update" />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Start from a Template (Optional)</label>
                <Select onValueChange={handleTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                  <SelectContent>
                    {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Subject Line</label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hello {{firstName}}" />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email Body</label>
                <Textarea 
                  value={bodyTemplate} 
                  onChange={e => setBodyTemplate(e.target.value)} 
                  placeholder="Hi {{firstName}},&#10;&#10;..." 
                  className="min-h-[250px] font-mono text-sm" 
                />
                <p className="text-xs text-gray-500 mt-2">Available variables: {'{{firstName}}, {{lastName}}, {{company}}'}</p>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} disabled={!name || !subject || !bodyTemplate}>
                Next: Select Audience
              </Button>
            </div>
          </div>
        )}
        
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold border-b pb-2">2. Select Audience</h2>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4 border rounded-lg overflow-hidden flex flex-col h-[400px]">
                <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input className="pl-9 h-8 bg-white text-sm" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <Button variant="secondary" size="sm" onClick={addAllMatching} className="ml-3 h-8">
                    Add All
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {contactsData?.data.map(contact => (
                    <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.firstName} {contact.lastName}</p>
                        <p className="text-xs text-gray-500">{contact.email}</p>
                      </div>
                      <Button 
                        variant={selectedContacts.includes(contact.id) ? "secondary" : "outline"} 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => toggleContact(contact.id)}
                      >
                        {selectedContacts.includes(contact.id) ? "Selected" : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="w-full md:w-64 bg-slate-50 rounded-lg p-4 flex flex-col h-[400px]">
                <h3 className="font-medium text-gray-900 mb-3 flex justify-between items-center">
                  <span>Selected</span>
                  <Badge variant="secondary">{selectedContacts.length}</Badge>
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {selectedContacts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center mt-10">No contacts selected.</p>
                  ) : (
                    contactsData?.data.filter(c => selectedContacts.includes(c.id)).map(contact => (
                      <div key={contact.id} className="bg-white border rounded p-2 text-sm flex items-center justify-between">
                        <span className="truncate">{contact.firstName} {contact.lastName}</span>
                        <button onClick={() => toggleContact(contact.id)} className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={selectedContacts.length === 0}>
                Next: Schedule
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold border-b pb-2">3. Schedule</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className={`cursor-pointer transition-colors ${scheduleMode === 'now' ? 'border-blue-600 bg-blue-50/50' : 'hover:border-gray-300'}`} onClick={() => setScheduleMode("now")}>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${scheduleMode === 'now' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Send Now</h3>
                    <p className="text-sm text-gray-500 mt-1">Campaign will begin processing immediately after launch.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className={`cursor-pointer transition-colors ${scheduleMode === 'later' ? 'border-blue-600 bg-blue-50/50' : 'hover:border-gray-300'}`} onClick={() => setScheduleMode("later")}>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${scheduleMode === 'later' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Schedule for Later</h3>
                    <p className="text-sm text-gray-500 mt-1">Set a specific date and time for sending.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {scheduleMode === "later" && (
              <div className="bg-gray-50 p-4 rounded-lg border mt-4">
                <label className="block text-sm font-medium mb-2">Select Date & Time</label>
                <Input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)} disabled={scheduleMode === "later" && !scheduledDate}>
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold border-b pb-2">4. Review & Launch</h2>
            
            <div className="bg-slate-50 rounded-lg border p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Campaign Name</p>
                  <p className="text-base font-semibold text-gray-900">{name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Audience</p>
                  <p className="text-base font-semibold text-gray-900">{selectedContacts.length} contacts</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 font-medium">Subject</p>
                  <p className="text-base text-gray-900">{subject}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 font-medium">Schedule</p>
                  <p className="text-base font-semibold text-gray-900">
                    {scheduleMode === "now" ? "Immediate" : new Date(scheduledDate).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
              <Play className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">Ready to launch</h4>
                <p className="text-sm text-blue-800 mt-1">Please double-check your audience and content before launching. Emails cannot be unsent once processed.</p>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(3)} disabled={createMutation.isPending || sendMutation.isPending}>Back</Button>
              <Button onClick={handleLaunch} disabled={createMutation.isPending || sendMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]">
                {(createMutation.isPending || sendMutation.isPending) ? "Processing..." : (scheduleMode === "now" ? "Launch Campaign" : "Schedule Campaign")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
