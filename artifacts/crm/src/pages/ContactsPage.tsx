import React, { useState, useMemo, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { Link, useLocation } from "wouter";
import { useListContacts, getListContactsQueryKey, useCreateContact, useListOrganizations, getListOrganizationsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Users, Search, Plus, Filter, Download, Mail, Phone, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cleanContactData } from "@/lib/api";
import { MoreVertical, ClipboardCheck } from "lucide-react";

const createSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  organizationId: z.string().min(1, "Organization is required"),
});

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function ContactsPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'ContactsPage' });
  }, []);

  const { isViewer } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState<string>("ALL");
  const [organizationId, setOrganizationId] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("createdAt_desc");
  const [scoreFilter, setScoreFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [cleanDataContact, setCleanDataContact] = useState<any>(null);
  const [cleanDataResult, setCleanDataResult] = useState<any>(null);
  const [cleanDataLoading, setCleanDataLoading] = useState(false);
  const [isCleanDataOpen, setIsCleanDataOpen] = useState(false);

  const scoreRange = scoreFilter === "cold" ? { scoreMin: "0", scoreMax: "30" }
    : scoreFilter === "warm" ? { scoreMin: "31", scoreMax: "60" }
    : scoreFilter === "hot" ? { scoreMin: "61", scoreMax: "80" }
    : scoreFilter === "ready" ? { scoreMin: "81", scoreMax: "100" }
    : {};

  const queryParams = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: status === "ALL" ? undefined : status,
    organizationId: organizationId === "ALL" ? undefined : organizationId,
    sortBy: sortBy !== "createdAt_desc" ? sortBy : undefined,
    ...scoreRange,
    page,
    limit: 20
  }), [debouncedSearch, status, organizationId, sortBy, scoreFilter, page]);

  const { data, isLoading } = useListContacts(queryParams, {
    query: { queryKey: getListContactsQueryKey(queryParams) }
  });

  const { data: orgsData } = useListOrganizations({ limit: 100 }, {
    query: { queryKey: getListOrganizationsQueryKey({ limit: 100 }) }
  });

  const createMutation = useCreateContact();

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema as any),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", role: "", status: "ACTIVE", organizationId: "" }
  });

  const onSubmit = (values: z.infer<typeof createSchema>) => {
    createMutation.mutate({ data: values }, {
      onSuccess: (contact) => {
        toast({ title: "Contact created successfully" });
        setIsSheetOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setLocation(`/contacts/${contact.id}`);
      },
      onError: (err) => {
        toast({ title: "Failed to create contact", description: err.message, variant: "destructive" });
      }
    });
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

  const handleCheckDataQuality = async (contact: any) => {
    setCleanDataContact(contact);
    setCleanDataLoading(true);
    setCleanDataResult(null);
    setIsCleanDataOpen(true);
    try {
      const contactData = { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, role: contact.role, status: contact.status };
      const res = await cleanContactData({ contacts: [contactData] });
      if (res.success && res.result) {
        setCleanDataResult(res.result);
      } else {
        throw new Error(res.error || "Failed to check data quality");
      }
    } catch (e: any) {
      setIsCleanDataOpen(false);
      const msg = e?.message || "";
      if (msg.includes("OPENAI_API_KEY") || msg.includes("AI features")) {
        toast({ title: "AI features are not configured", description: "Please contact your administrator.", variant: "destructive" });
      } else {
        toast({ title: "AI unavailable", description: msg, variant: "destructive" });
      }
    } finally {
      setCleanDataLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contacts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage people and relationships.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="hidden sm:flex">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {!isViewer && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Contact
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Create Contact</SheetTitle>
                  <SheetDescription>Add a new contact to your CRM.</SheetDescription>
                </SheetHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email *</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="organizationId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {orgsData?.data.map(org => (
                              <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="role" render={({ field }) => (
                      <FormItem><FormLabel>Role / Job Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="PROSPECT">Prospect</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creating..." : "Create Contact"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search by name or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-4 w-4 text-gray-400 hidden sm:block" />
            <Select value={organizationId} onValueChange={(val) => { setOrganizationId(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[200px] bg-white">
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Organizations</SelectItem>
                {orgsData?.data.map(org => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px] bg-white">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PROSPECT">Prospect</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scoreFilter} onValueChange={(val) => { setScoreFilter(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px] bg-white">
                <SelectValue placeholder="Lead Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Scores</SelectItem>
                <SelectItem value="cold">Cold (0–30)</SelectItem>
                <SelectItem value="warm">Warm (31–60)</SelectItem>
                <SelectItem value="hot">Hot (61–80)</SelectItem>
                <SelectItem value="ready">Ready (81–100)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(val) => { setSortBy(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px] bg-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt_desc">Newest first</SelectItem>
                <SelectItem value="leadScore_desc">Score: High → Low</SelectItem>
                <SelectItem value="leadScore_asc">Score: Low → High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-semibold text-gray-900">Name & Role</TableHead>
                <TableHead className="font-semibold text-gray-900">Contact</TableHead>
                <TableHead className="font-semibold text-gray-900">Organization</TableHead>
                <TableHead className="font-semibold text-gray-900">Status</TableHead>
                <TableHead className="font-semibold text-gray-900 text-right">Last Contacted</TableHead>
                <TableHead className="font-semibold text-gray-900 w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="font-medium text-gray-900">No contacts found</p>
                    <p className="text-sm mt-1">Try adjusting your filters.</p>
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((contact) => (
                  <TableRow 
                    key={contact.id} 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setLocation(`/contacts/${contact.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</div>
                      <div className="text-sm text-gray-500">{contact.role || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-900 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" /> {contact.email}</div>
                      {contact.phone && <div className="text-sm text-gray-500 flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5 text-gray-400" /> {contact.phone}</div>}
                    </TableCell>
                    <TableCell>
                      {contact.organizationName ? (
                        <Link href={`/organizations/${contact.organizationId}`} className="text-blue-600 hover:underline text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                          {contact.organizationName}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`text-[11px] uppercase ${getStatusColor(contact.status)}`}>
                          {contact.status}
                        </Badge>
                        {(contact as any).leadScore != null && (() => {
                          const score = (contact as any).leadScore as number;
                          const label = (contact as any).leadScoreLabel as string || "";
                          const color = score <= 30 ? "bg-blue-100 text-blue-700 border-blue-200"
                            : score <= 60 ? "bg-amber-100 text-amber-700 border-amber-200"
                            : score <= 80 ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-green-100 text-green-700 border-green-200";
                          return (
                            <Badge variant="outline" className={`text-[10px] ${color}`}>
                              {label} {score}/100
                            </Badge>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-gray-500 text-sm">
                      {contact.lastContactedAt ? formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCheckDataQuality(contact); }}>
                            <Sparkles className="h-4 w-4 mr-2 text-violet-600" /> Check Data Quality
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {data && data.totalPages > 1 && (
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
                  Page {data.page} of {data.totalPages}
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    className={page === data.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* Clean Contact Data Dialog */}
      <Dialog open={isCleanDataOpen} onOpenChange={setIsCleanDataOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> Data Quality Check</DialogTitle>
          </DialogHeader>
          {cleanDataContact && <p className="text-sm text-gray-600 font-medium">{cleanDataContact.firstName} {cleanDataContact.lastName}</p>}
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
    </div>
  );
}
