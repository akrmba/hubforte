import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { 
  LayoutGrid, 
  List, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  ChevronRight,
  Calendar,
  Building2,
  DollarSign,
  User,
  ArrowRightLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const opportunitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  stage: z.enum(["PROSPECT", "APPROACH", "APPLIED", "AWARDED", "DECLINED", "LOST"]),
  value: z.string().transform((v) => (v === "" ? 0 : parseFloat(v))),
  funderId: z.string().optional(),
  organizationId: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  expectedCloseDate: z.string().optional(),
  description: z.string().optional(),
});

const STAGES = ["PROSPECT", "APPROACH", "APPLIED", "AWARDED", "DECLINED", "LOST"] as const;

export default function PipelinePage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'PipelinePage' });
  }, []);

  const { isViewer, user } = useAuth();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: opportunitiesData, isLoading } = useQuery({
    queryKey: ["opportunities", search, ownerFilter, view === "kanban" ? "all" : page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (ownerFilter !== "all") params.append("ownerId", ownerFilter);
      params.append("limit", view === "kanban" ? "100" : "25");
      if (view === "list") params.append("page", String(page));
      return api.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(`/opportunities?${params.toString()}`);
    }
  });

  const opportunities = opportunitiesData?.data;

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<any[]>("/admin/users").catch(() => [])
  });

  const { data: funders } = useQuery({
    queryKey: ["funders"],
    queryFn: () => api.get<any>("/funders").then(res => res.data || [])
  });

  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<any>("/organizations").then(res => res.data || [])
  });

  const createOpportunity = useMutation({
    mutationFn: (data: any) => api.post("/opportunities", data),
    onSuccess: () => {
      toast({ title: "Opportunity created" });
      setIsSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      form.reset();
    }
  });

  const updateOpportunity = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/opportunities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    }
  });

  const form = useForm<z.infer<typeof opportunitySchema>>({
    resolver: zodResolver(opportunitySchema as any),
    defaultValues: {
      name: "",
      stage: "PROSPECT",
      value: "0" as any,
      ownerId: user?.id || "",
      expectedCloseDate: "",
      description: "",
    }
  });

  const onSubmit = (values: z.infer<typeof opportunitySchema>) => {
    createOpportunity.mutate({
      ...values,
      funderId: values.funderId === "none" ? undefined : values.funderId,
      organizationId: values.organizationId === "none" ? undefined : values.organizationId,
    });
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("opportunityId", id);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, stage: string) => {
    const id = e.dataTransfer.getData("opportunityId");
    if (id) {
      updateOpportunity.mutate({ id, data: { stage } });
    }
  };

  const getStageStats = (stage: string) => {
    const stageOpps = opportunities?.filter(o => o.stage === stage) || [];
    const count = stageOpps.length;
    const totalValue = stageOpps.reduce((sum, o) => sum + (parseFloat(o.value) || 0), 0);
    return { count, totalValue };
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track funding opportunities.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 p-1 rounded-lg flex items-center">
            <Button 
              variant={view === "kanban" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setView("kanban")}
              className={view === "kanban" ? "bg-white shadow-sm" : ""}
            >
              <LayoutGrid className="h-4 w-4 mr-2" /> Kanban
            </Button>
            <Button 
              variant={view === "list" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setView("list")}
              className={view === "list" ? "bg-white shadow-sm" : ""}
            >
              <List className="h-4 w-4 mr-2" /> List
            </Button>
          </div>
          {!isViewer && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> New Opportunity
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Create Opportunity</SheetTitle>
                  <SheetDescription>Add a new funding opportunity to the pipeline.</SheetDescription>
                </SheetHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Opportunity Name *</FormLabel>
                        <FormControl><Input placeholder="e.g. Core Funding 2024" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="stage" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stage</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="value" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Value (£)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="ownerId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {users?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="funderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Funder</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || "none"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select funder" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {funders?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="organizationId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || "none"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {organizations?.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="expectedCloseDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Close Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={createOpportunity.isPending}>
                      {createOpportunity.isPending ? "Creating..." : "Create Opportunity"}
                    </Button>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search opportunities..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue placeholder="All Owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            {users?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">Loading...</div>
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
          {STAGES.map(stage => {
            const { count, totalValue } = getStageStats(stage);
            const stageOpps = opportunities?.filter(o => o.stage === stage) || [];
            
            return (
              <div 
                key={stage} 
                className="flex-shrink-0 w-80 bg-gray-50 rounded-xl p-3 border border-gray-200 flex flex-col"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, stage)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-gray-700">{stage}</h3>
                    <Badge variant="secondary" className="bg-gray-200 text-gray-600 rounded-full px-2 py-0">
                      {count}
                    </Badge>
                  </div>
                  <span className="text-xs font-medium text-gray-500">
                    £{totalValue.toLocaleString()}
                  </span>
                </div>
                
                <div className="space-y-3 flex-1">
                  {stageOpps.map(opp => (
                    <Link key={opp.id} href={`/pipeline/${opp.id}`}>
                      <Card 
                        className="cursor-pointer hover:shadow-md transition-shadow group relative"
                        draggable={!isViewer}
                        onDragStart={(e) => onDragStart(e, opp.id)}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                              {opp.name}
                            </h4>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {STAGES.filter(s => s !== stage).map(s => (
                                  <DropdownMenuItem key={s} onClick={(e) => {
                                    e.stopPropagation();
                                    updateOpportunity.mutate({ id: opp.id, data: { stage: s } });
                                  }}>
                                    Move to {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center text-xs text-gray-500 gap-1">
                              <Building2 className="h-3 w-3" />
                              <span className="truncate">{opp.funderName || opp.organizationName || "No partner"}</span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center text-sm font-bold text-gray-900">
                                £{(parseFloat(opp.value) || 0).toLocaleString()}
                              </div>
                              <div className="flex items-center gap-1">
                                {opp.expectedCloseDate && (
                                  <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {format(new Date(opp.expectedCloseDate), "MMM d")}
                                  </div>
                                )}
                                <div 
                                  className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold border border-blue-200"
                                  title={opp.ownerName}
                                >
                                  {getInitials(opp.ownerName)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                  {stageOpps.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 italic">
                      No opportunities
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Exp. Close</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities?.map(opp => (
                <TableRow key={opp.id} className="cursor-pointer" onClick={() => (window.location.href = `/pipeline/${opp.id}`)}>
                  <TableCell className="font-medium">{opp.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                      {opp.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>£{(parseFloat(opp.value) || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {opp.funderName || opp.organizationName || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold border border-blue-200">
                        {getInitials(opp.ownerName)}
                      </div>
                      <span className="text-sm">{opp.ownerName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {opp.expectedCloseDate ? format(new Date(opp.expectedCloseDate), "MMM d, yyyy") : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/pipeline/${opp.id}`}>
                      <Button variant="ghost" size="icon">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {opportunities?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    No opportunities found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {view === "list" && opportunitiesData && opportunitiesData.totalPages > 1 && (
            <div className="p-4 border-t border-gray-200">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  <PaginationItem className="px-4 text-sm text-gray-500">
                    Page {opportunitiesData.page} of {opportunitiesData.totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage(p => Math.min(opportunitiesData.totalPages, p + 1))}
                      className={page === opportunitiesData.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
