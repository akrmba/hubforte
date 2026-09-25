import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useRoute, useLocation } from "wouter";
import { 
  useGetOrganization, 
  getGetOrganizationQueryKey, 
  useUpdateOrganization, 
  useDeleteOrganization,
  useCreateContact,
  useCreateActivity,
  useCreateTask,
  getListOrganizationsQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Building2, MapPin, User, FileText, Activity as ActivityIcon, Edit, Trash2, Plus, Mail, Phone, MoreHorizontal, TrendingUp, LifeBuoy, ExternalLink, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import NotFound from "@/pages/not-found";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
});

const activitySchema = z.object({
  type: z.string().min(1, "Type is required"),
  summary: z.string().min(1, "Summary is required"),
  contactId: z.string().optional(),
});

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  priority: z.string().min(1, "Priority is required"),
  contactId: z.string().optional(),
});

export default function OrganizationDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'OrganizationDetailPage' });
  }, []);

  const [, params] = useRoute("/organizations/:id");
  const id = params?.id || "";
  const [, setLocation] = useLocation();
  const { isViewer, isManager, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useGetOrganization(id, {
    query: { enabled: !!id, queryKey: getGetOrganizationQueryKey(id) }
  });

  const deleteMutation = useDeleteOrganization();
  const createContactMutation = useCreateContact();
  const createActivityMutation = useCreateActivity();
  const createTaskMutation = useCreateTask();

  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isActivitySheetOpen, setIsActivitySheetOpen] = useState(false);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);

  const { data: pipelineData } = useQuery({
    queryKey: ["org-pipeline", id],
    queryFn: () => api.get(`/opportunities?organizationId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: orgTicketsData } = useQuery({
    queryKey: ["org-tickets", id],
    queryFn: () => api.get(`/support/tickets?organizationId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: orgFundersData } = useQuery({
    queryKey: ["org-funders", id],
    queryFn: () => api.get(`/funders?organizationId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const contactForm = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema as any),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", role: "", status: "ACTIVE" }
  });

  const activityForm = useForm<z.infer<typeof activitySchema>>({
    resolver: zodResolver(activitySchema as any),
    defaultValues: { type: "NOTE", summary: "", contactId: "none" }
  });

  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema as any),
    defaultValues: { title: "", description: "", dueDate: "", priority: "MEDIUM", contactId: "none" }
  });

  const onContactSubmit = (values: z.infer<typeof contactSchema>) => {
    createContactMutation.mutate({ data: { ...values, organizationId: id } }, {
      onSuccess: () => {
        toast({ title: "Contact added" });
        setIsContactSheetOpen(false);
        contactForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey(id) });
      }
    });
  };

  const onActivitySubmit = (values: z.infer<typeof activitySchema>) => {
    createActivityMutation.mutate({ 
      data: { 
        ...values, 
        organizationId: id,
        contactId: values.contactId === "none" ? undefined : values.contactId
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Activity logged" });
        setIsActivitySheetOpen(false);
        activityForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey(id) });
      }
    });
  };

  const onTaskSubmit = (values: z.infer<typeof taskSchema>) => {
    createTaskMutation.mutate({ 
      data: { 
        ...values, 
        organizationId: id,
        contactId: values.contactId === "none" ? undefined : values.contactId
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Task created" });
        setIsTaskSheetOpen(false);
        taskForm.reset();
        queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey(id) });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Organization deleted" });
        queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
        setLocation("/organizations");
      }
    });
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-32 w-full mb-6" /><Skeleton className="h-64 w-full" /></div>;
  if (!org) return <NotFound />;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-2xl font-bold border border-blue-200">
            {org.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs uppercase bg-gray-100 text-gray-700">{org.type}</Badge>
              <Badge variant="outline" className="text-xs uppercase">{org.status}</Badge>
              <span className="text-sm text-gray-500 flex items-center gap-1 ml-2">
                <MapPin className="h-3.5 w-3.5" /> {org.location || "No location"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isViewer && (
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {(isManager || isAdmin) && !isViewer && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this organization and all associated contacts and activity records. This action cannot be undone.
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="contacts">
            <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="pipeline" className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Pipeline</TabsTrigger>
              <TabsTrigger value="tickets" className="flex items-center gap-1"><LifeBuoy className="h-3.5 w-3.5" /> Tickets</TabsTrigger>
            </TabsList>
            
            <TabsContent value="contacts" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
                {!isViewer && (
                  <Sheet open={isContactSheetOpen} onOpenChange={setIsContactSheetOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add Contact</Button>
                    </SheetTrigger>
                    <SheetContent className="sm:max-w-md overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Add Contact</SheetTitle>
                        <SheetDescription>Add a new contact to {org.name}.</SheetDescription>
                      </SheetHeader>
                      <Form {...contactForm}>
                        <form onSubmit={contactForm.handleSubmit(onContactSubmit)} className="space-y-4 mt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={contactForm.control} name="firstName" render={({ field }) => (
                              <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={contactForm.control} name="lastName" render={({ field }) => (
                              <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>
                          <FormField control={contactForm.control} name="email" render={({ field }) => (
                            <FormItem><FormLabel>Email *</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={contactForm.control} name="role" render={({ field }) => (
                            <FormItem><FormLabel>Job Title / Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={contactForm.control} name="phone" render={({ field }) => (
                            <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <div className="pt-4 flex justify-end">
                            <Button type="submit" disabled={createContactMutation.isPending}>
                              {createContactMutation.isPending ? "Adding..." : "Add Contact"}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </SheetContent>
                  </Sheet>
                )}
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Contact Info</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {org.contacts.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-6 text-gray-500">No contacts yet.</TableCell></TableRow>
                    ) : (
                      org.contacts.map(contact => (
                        <TableRow key={contact.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setLocation(`/contacts/${contact.id}`)}>
                          <TableCell>
                            <div className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</div>
                            <div className="text-xs text-gray-500 mt-1"><Badge variant="outline" className="text-[10px] uppercase">{contact.status}</Badge></div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{contact.role || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" /> {contact.email}</div>
                            {contact.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /> {contact.phone}</div>}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Activity Timeline</h2>
                {!isViewer && (
                  <Sheet open={isActivitySheetOpen} onOpenChange={setIsActivitySheetOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm" variant="outline"><ActivityIcon className="h-4 w-4 mr-2" /> Log Activity</Button>
                    </SheetTrigger>
                    <SheetContent className="sm:max-w-md overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Log Activity</SheetTitle>
                        <SheetDescription>Record a meeting, call, or note for {org.name}.</SheetDescription>
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
                          <FormField control={activityForm.control} name="contactId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Related Contact (Optional)</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="none">No specific contact</SelectItem>
                                  {org.contacts.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>
                                  ))}
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
                {org.activities.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 ml-10">No activity recorded yet.</div>
                ) : (
                  org.activities.map((activity, index) => (
                    <div key={activity.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-50 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {activity.type === 'EMAIL' && <Mail className="h-4 w-4" />}
                        {activity.type === 'NOTE' && <FileText className="h-4 w-4" />}
                        {activity.type === 'CALL' && <Phone className="h-4 w-4" />}
                        {(activity.type !== 'EMAIL' && activity.type !== 'NOTE' && activity.type !== 'CALL') && <ActivityIcon className="h-4 w-4" />}
                      </div>
                      <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-blue-600">{activity.type}</span>
                          <span className="text-xs text-gray-500">{new Date(activity.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-gray-900 mt-2">{activity.summary}</p>
                        {activity.contactName && <p className="text-xs text-gray-500 mt-2">with {activity.contactName}</p>}
                      </Card>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="tasks" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
                {!isViewer && (
                  <Sheet open={isTaskSheetOpen} onOpenChange={setIsTaskSheetOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-2" /> Add Task</Button>
                    </SheetTrigger>
                    <SheetContent className="sm:max-w-md overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Create Task</SheetTitle>
                        <SheetDescription>Add a new task for {org.name}.</SheetDescription>
                      </SheetHeader>
                      <Form {...taskForm}>
                        <form onSubmit={taskForm.handleSubmit(onTaskSubmit)} className="space-y-4 mt-4">
                          <FormField control={taskForm.control} name="title" render={({ field }) => (
                            <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={taskForm.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={taskForm.control} name="dueDate" render={({ field }) => (
                            <FormItem><FormLabel>Due Date *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-4">
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
                            <FormField control={taskForm.control} name="contactId" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Contact (Optional)</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Contact" /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {org.contacts.map(c => (
                                      <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>
                                    ))}
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
              <div className="space-y-3">
                {org.tasks.length === 0 ? (
                  <Card className="p-6 text-center text-gray-500 bg-gray-50/50">No tasks currently.</Card>
                ) : (
                  org.tasks.map(task => {
                    const isOverdue = task.status !== "DONE" && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
                    return (
                      <Card key={task.id} className={`border-l-4 ${isOverdue ? 'border-l-red-500' : 'border-l-blue-500'} p-4`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className={`font-medium text-gray-900 ${task.status === 'DONE' ? 'line-through text-gray-500' : ''}`}>{task.title}</h4>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                              <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                              <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-[10px] uppercase">{task.priority}</Badge>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="pipeline" className="space-y-4">
              {(() => {
                const opps = Array.isArray((pipelineData as any)?.opportunities) ? (pipelineData as any).opportunities : (Array.isArray(pipelineData) ? pipelineData : []);
                const stageColors: Record<string, string> = {
                  PROSPECT: "bg-gray-50 text-gray-700 border-gray-200",
                  APPROACH: "bg-blue-50 text-blue-700 border-blue-200",
                  APPLIED: "bg-violet-50 text-violet-700 border-violet-200",
                  AWARDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  DECLINED: "bg-red-50 text-red-700 border-red-200",
                  LOST: "bg-gray-50 text-gray-500 border-gray-200",
                };
                if (opps.length === 0) {
                  return (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <TrendingUp className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">No pipeline opportunities</p>
                        <p className="text-xs text-gray-500 mt-1">Add opportunities linked to this organisation from the Pipeline page.</p>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <div className="space-y-3">
                    {opps.map((opp: any) => (
                      <Card key={opp.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="font-medium text-gray-900 text-sm">{opp.name}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-xs ${stageColors[opp.stage] || ""}`}>{opp.stage}</Badge>
                              {opp.value && <span className="text-xs text-gray-500">£{Number(opp.value).toLocaleString()}</span>}
                              {opp.funderName && <span className="text-xs text-gray-400">{opp.funderName}</span>}
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
                const tickets = Array.isArray((orgTicketsData as any)?.tickets) ? (orgTicketsData as any).tickets : (Array.isArray(orgTicketsData) ? orgTicketsData : []);
                if (tickets.length === 0) {
                  return (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <LifeBuoy className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">No support tickets</p>
                        <p className="text-xs text-gray-500 mt-1">Tickets for this organisation will appear here.</p>
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
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-medium">Owner</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                    {org.ownerName?.charAt(0) || "U"}
                  </div>
                  <span className="text-sm text-gray-900">{org.ownerName || "Unassigned"}</span>
                </div>
              </div>
              {org.notes && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Notes</label>
                  <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{org.notes}</p>
                </div>
              )}
              <div className="pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                <span>Created: {new Date(org.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Linked Funders Card */}
          {(() => {
            const funders = Array.isArray(orgFundersData) ? orgFundersData : ((orgFundersData as any)?.data ?? []);
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-gray-400" /> Linked Funders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {funders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-2">No funders linked to contacts in this organisation.</p>
                  ) : (
                    <div className="space-y-2">
                      {funders.map((funder: any) => (
                        <a key={funder.id} href={`/funders/${funder.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                          <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {funder.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">{funder.name}</p>
                            <p className="text-xs text-gray-500">{funder.type}</p>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
