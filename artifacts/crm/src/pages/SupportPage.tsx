import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Ticket, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  User,
  MessageSquare
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";

const ticketSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  contactId: z.string().optional(),
  organizationId: z.string().optional(),
});

type TicketSummary = {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  reportedBy: string;
  assignedTo: string | null;
  contactName: string | null;
  createdAt: string;
  lastUpdateAt: string | null;
  updateCount: number;
};

type TicketStats = {
  OPEN: number;
  IN_PROGRESS: number;
  WAITING: number;
  RESOLVED: number;
};

export default function SupportPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'SupportPage' });
  }, []);

  const { isViewer, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support", "tickets", { search, statusFilter, priorityFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (priorityFilter !== "all") params.append("priority", priorityFilter);
      return api.get<TicketSummary[]>(`/support/tickets?${params.toString()}`);
    }
  });

  const { data: stats } = useQuery({
    queryKey: ["support", "stats"],
    queryFn: async () => {
      const all = await api.get<TicketSummary[]>("/support/tickets");
      const counts: TicketStats = { OPEN: 0, IN_PROGRESS: 0, WAITING: 0, RESOLVED: 0 };
      all.forEach(t => {
        if (t.status in counts) counts[t.status as keyof TicketStats]++;
      });
      return counts;
    }
  });

  const createTicket = useMutation({
    mutationFn: (data: z.infer<typeof ticketSchema>) => api.post("/support/tickets", data),
    onSuccess: () => {
      toast({ title: "Ticket created successfully" });
      setIsSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create ticket", description: err.message, variant: "destructive" });
    }
  });

  const form = useForm<z.infer<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema as any),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
    }
  });

  const onSubmit = (values: z.infer<typeof ticketSchema>) => {
    createTicket.mutate(values);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN": return "bg-blue-100 text-blue-700 border-blue-200";
      case "IN_PROGRESS": return "bg-amber-100 text-amber-700 border-amber-200";
      case "WAITING": return "bg-purple-100 text-purple-700 border-purple-200";
      case "RESOLVED": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT": return "bg-red-100 text-red-700 border-red-200 font-bold";
      case "HIGH": return "bg-orange-100 text-orange-700 border-orange-200";
      case "MEDIUM": return "bg-blue-100 text-blue-700 border-blue-200";
      case "LOW": return "bg-gray-100 text-gray-700 border-gray-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Support Tickets</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and resolve customer support requests.</p>
        </div>
        {!isViewer && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Ticket
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Create New Ticket</SheetTitle>
                <SheetDescription>Open a new support request.</SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl><Input {...field} placeholder="Brief summary of the issue" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl><Textarea {...field} placeholder="Detailed explanation..." className="min-h-[100px]" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priority" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="URGENT">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="pt-4 flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createTicket.isPending}>
                      {createTicket.isPending ? "Creating..." : "Create Ticket"}
                    </Button>
                  </div>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Open</span>
            <span className="text-2xl font-bold text-blue-600">{stats?.OPEN ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">In Progress</span>
            <span className="text-2xl font-bold text-amber-600">{stats?.IN_PROGRESS ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Waiting</span>
            <span className="text-2xl font-bold text-purple-600">{stats?.WAITING ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resolved</span>
            <span className="text-2xl font-bold text-green-600">{stats?.RESOLVED ?? 0}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                placeholder="Search tickets..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="WAITING">Waiting</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticket</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Reported By</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Last Update</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading tickets...</td>
                  </tr>
                ) : tickets?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No tickets found matching your criteria.</td>
                  </tr>
                ) : (
                  tickets?.map((ticket) => (
                    <tr 
                      key={ticket.id} 
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/support/tickets/${ticket.id}`)}
                    >
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-400 text-[10px] mb-0.5">{ticket.ticketNumber}</span>
                          <span className="font-semibold text-gray-900 truncate max-w-[200px]">{ticket.title}</span>
                          {ticket.contactName && <span className="text-xs text-gray-500 mt-0.5">{ticket.contactName}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={getStatusColor(ticket.status)} variant="outline">
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={getPriorityColor(ticket.priority)} variant="outline">
                          {ticket.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 uppercase">
                            {ticket.reportedBy?.split(' ').map(n => n[0]).join('') || '?'}
                          </div>
                          <span className="text-gray-600">{ticket.reportedBy}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-600">
                        {ticket.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600 uppercase">
                              {ticket.assignedTo?.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span>{ticket.assignedTo}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-500">
                        {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-gray-500">
                            {ticket.lastUpdateAt ? format(new Date(ticket.lastUpdateAt), "MMM d, HH:mm") : "-"}
                          </span>
                          {ticket.updateCount > 0 && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {ticket.updateCount} updates
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
