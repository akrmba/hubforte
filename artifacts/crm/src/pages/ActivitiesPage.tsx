import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useListActivities, getListActivitiesQueryKey, useCreateActivity, useListContacts, getListContactsQueryKey, useListOrganizations, getListOrganizationsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Activity, Plus, Mail, Phone, FileText, Users, CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const activityTypeIcons: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  CALL: <Phone className="h-4 w-4" />,
  NOTE: <FileText className="h-4 w-4" />,
  MEETING: <Users className="h-4 w-4" />,
  TASK_COMPLETED: <CheckSquare className="h-4 w-4" />,
};

const activityTypeColors: Record<string, string> = {
  EMAIL: "bg-blue-50 text-blue-700 border-blue-200",
  CALL: "bg-green-50 text-green-700 border-green-200",
  NOTE: "bg-yellow-50 text-yellow-700 border-yellow-200",
  MEETING: "bg-purple-50 text-purple-700 border-purple-200",
  TASK_COMPLETED: "bg-gray-50 text-gray-700 border-gray-200",
};

const activitySchema = z.object({
  type: z.string().min(1, "Type is required"),
  summary: z.string().min(1, "Summary is required"),
  date: z.string().min(1, "Date is required"),
  contactId: z.string().optional(),
  organizationId: z.string().optional(),
});

export default function ActivitiesPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'ActivitiesPage' });
  }, []);

  const { isViewer } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListActivities(
    { limit: 100 },
    { query: { queryKey: getListActivitiesQueryKey({ limit: 100 }) } }
  );

  const { data: contactsData } = useListContacts({ limit: 200 }, { query: { queryKey: getListContactsQueryKey({ limit: 200 }) } });
  const { data: orgsData } = useListOrganizations({ limit: 200 }, { query: { queryKey: getListOrganizationsQueryKey({ limit: 200 }) } });

  const createActivity = useCreateActivity();

  const form = useForm<z.infer<typeof activitySchema>>({
    resolver: zodResolver(activitySchema as any),
    defaultValues: { type: "CALL", summary: "", date: new Date().toISOString().slice(0, 10), contactId: "none", organizationId: "none" }
  });

  const onSubmit = (values: z.infer<typeof activitySchema>) => {
    createActivity.mutate({
      data: {
        ...values,
        contactId: values.contactId === "none" ? undefined : values.contactId,
        organizationId: values.organizationId === "none" ? undefined : values.organizationId,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Activity logged" });
        setIsSheetOpen(false);
        form.reset({ type: "CALL", summary: "", date: new Date().toISOString().slice(0, 10), contactId: "none", organizationId: "none" });
        queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to log activity", variant: "destructive" });
      }
    });
  };

  const activities = data ?? [];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Activities</h1>
          <p className="text-sm text-gray-500 mt-1">A log of all interactions — calls, emails, meetings, and notes.</p>
        </div>
        {!isViewer && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Log Activity
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Log Activity</SheetTitle>
                <SheetDescription>Record an interaction with a contact or organization.</SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="EMAIL">Email</SelectItem>
                          <SelectItem value="CALL">Call</SelectItem>
                          <SelectItem value="NOTE">Note</SelectItem>
                          <SelectItem value="MEETING">Meeting</SelectItem>
                          <SelectItem value="TASK_COMPLETED">Task Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="summary" render={({ field }) => (
                    <FormItem><FormLabel>Summary *</FormLabel><FormControl><Textarea {...field} placeholder="Describe what happened..." /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel>Date *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="contactId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Contact</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {contactsData?.data?.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="organizationId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Organization</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {orgsData?.data?.map(o => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={createActivity.isPending}>
                      {createActivity.isPending ? "Saving..." : "Log Activity"}
                    </Button>
                  </div>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-gray-500 py-8 text-center">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            <Activity className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-900">No activities yet</p>
            <p className="text-sm text-gray-500 mt-1">Log a call, email, or meeting to get started.</p>
          </div>
        ) : (
          activities.map(activity => (
            <Card key={activity.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                  {activityTypeIcons[activity.type] ?? <Activity className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{activity.summary}</p>
                    <Badge variant="outline" className={`shrink-0 text-[10px] uppercase font-bold ${activityTypeColors[activity.type] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                      {activity.type.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{format(new Date(activity.date), "MMM d, yyyy")}</span>
                    {activity.contactName && <span>• {activity.contactName}</span>}
                    {activity.organizationName && <span>• {activity.organizationName}</span>}
                    {activity.userName && <span>• by {activity.userName}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
