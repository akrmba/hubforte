import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useListTasks, getListTasksQueryKey, useUpdateTask, useCreateTask, useListContacts, getListContactsQueryKey, useListOrganizations, getListOrganizationsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { CheckSquare, Plus, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, isPast, isToday } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  priority: z.string().min(1, "Priority is required"),
  contactId: z.string().optional(),
  organizationId: z.string().optional(),
});

export default function TasksPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'TasksPage' });
  }, []);

  const { isViewer } = useAuth();
  const [mineOnly, setMineOnly] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tasksResponse, isLoading } = useListTasks({
    mine: mineOnly,
    status: "PENDING,IN_PROGRESS",
  } as any, {
    query: { queryKey: getListTasksQueryKey({ mine: mineOnly, status: "PENDING,IN_PROGRESS" }) }
  });

  const tasks = Array.isArray(tasksResponse) ? tasksResponse : (tasksResponse as any)?.data ?? [];
  const totalPages = Array.isArray(tasksResponse) ? 1 : (tasksResponse as any)?.totalPages ?? 1;
  const currentPage = Array.isArray(tasksResponse) ? 1 : (tasksResponse as any)?.page ?? 1;

  const { data: contactsData } = useListContacts({ limit: 100 }, { query: { queryKey: getListContactsQueryKey({ limit: 100 }) } });
  const { data: orgsData } = useListOrganizations({ limit: 100 }, { query: { queryKey: getListOrganizationsQueryKey({ limit: 100 }) } });

  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema as any),
    defaultValues: { title: "", description: "", dueDate: "", priority: "MEDIUM", contactId: "none", organizationId: "none" }
  });

  const onSubmit = (values: z.infer<typeof taskSchema>) => {
    createTask.mutate({ 
      data: {
        ...values,
        contactId: values.contactId === "none" ? undefined : values.contactId,
        organizationId: values.organizationId === "none" ? undefined : values.organizationId
      }
    }, {
      onSuccess: () => {
        toast({ title: "Task created" });
        setIsSheetOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const handleMarkDone = (taskId: string, checked: boolean) => {
    if (checked) {
      updateTask.mutate({ id: taskId, data: { status: "DONE" } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        }
      });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your to-dos and follow-ups.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setMineOnly(true)} 
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${mineOnly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              My Tasks
            </button>
            <button 
              onClick={() => setMineOnly(false)} 
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${!mineOnly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              All Tasks
            </button>
          </div>
          {!isViewer && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Task
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Create Task</SheetTitle>
                  <SheetDescription>Add a new follow-up or action item.</SheetDescription>
                </SheetHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="dueDate" render={({ field }) => (
                        <FormItem><FormLabel>Due Date *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="priority" render={({ field }) => (
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
                    <FormField control={form.control} name="contactId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Contact</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {contactsData?.data.map(c => (
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
                            {orgsData?.data.map(o => (
                              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" disabled={createTask.isPending}>
                        {createTask.isPending ? "Saving..." : "Save Task"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-gray-500 py-8 text-center">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            <CheckSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-900">No pending tasks found</p>
            <p className="text-sm text-gray-500 mt-1">You're all caught up!</p>
          </div>
        ) : (
          tasks.map((task: any) => {
            const date = new Date(task.dueDate);
            const overdue = isPast(date) && !isToday(date);
            
            return (
              <Card key={task.id} className={`hover:shadow-md transition-shadow ${overdue ? 'border-l-4 border-l-red-500' : ''}`}>
                <CardContent className="p-4 flex items-start gap-4">
                  <Checkbox 
                    className="mt-1 h-5 w-5 rounded-full" 
                    onCheckedChange={(c) => handleMarkDone(task.id, c as boolean)}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-gray-900">{task.title}</h3>
                      <Badge variant="outline" className={`text-[10px] uppercase font-bold
                        ${task.priority === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' : 
                          task.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                          'bg-gray-50 text-gray-700 border-gray-200'}`}>
                        {task.priority}
                      </Badge>
                    </div>
                    {task.description && <p className="text-sm text-gray-600 mt-1">{task.description}</p>}
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
                      <span className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                        Due: {format(date, "MMM d, yyyy")}
                      </span>
                      {task.contactName && (
                        <span className="text-gray-500 flex items-center gap-1">
                          • {task.contactName}
                        </span>
                      )}
                      {task.organizationName && (
                        <span className="text-gray-500 flex items-center gap-1">
                          • {task.organizationName}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
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
    </div>
  );
}
