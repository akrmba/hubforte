import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  ExternalLink, 
  Building2, 
  Users, 
  Target,
  ArrowRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const funderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["TRUST", "FOUNDATION", "GOVERNMENT", "CORPORATE", "INDIVIDUAL"]),
  status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]),
  fundingAreas: z.string(),
  typicalGrantMin: z.coerce.number().optional(),
  typicalGrantMax: z.coerce.number().optional(),
  relationshipOwnerId: z.string().min(1, "Owner is required"),
  website: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FunderFormValues = z.infer<typeof funderSchema>;

type Funder = {
  id: string;
  name: string;
  type: string;
  status: string;
  fundingAreas: string[];
  typicalGrantMin: number | null;
  typicalGrantMax: number | null;
  relationshipOwnerId: string;
  ownerName: string;
  opportunityCount: number;
  contactCount: number;
};

export default function FundersPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'FundersPage' });
  }, []);

  const { isViewer } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: fundersData, isLoading } = useQuery({
    queryKey: ["funders", search, typeFilter, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      params.append("page", String(page));
      params.append("limit", "25");
      return api.get<{ data: Funder[]; total: number; page: number; limit: number; totalPages: number }>(`/funders?${params.toString()}`);
    }
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ id: string, name: string }[]>("/admin/users").catch(() => [])
  });

  const form = useForm<FunderFormValues>({
    resolver: zodResolver(funderSchema as any),
    defaultValues: {
      name: "",
      type: "TRUST",
      status: "ACTIVE",
      fundingAreas: "",
      typicalGrantMin: 0,
      typicalGrantMax: 0,
      relationshipOwnerId: "",
      website: "",
      notes: "",
    }
  });

  const createFunder = useMutation({
    mutationFn: (values: any) => api.post("/funders", values),
    onSuccess: () => {
      toast({ title: "Funder created" });
      setIsSheetOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["funders"] });
    },
    onError: (err: any) => {
      toast({ title: "Error creating funder", description: err.message, variant: "destructive" });
    }
  });

  const onSubmit = (values: FunderFormValues) => {
    const data = {
      ...values,
      fundingAreas: values.fundingAreas.split(",").map(s => s.trim()).filter(Boolean)
    };
    createFunder.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-green-100 text-green-700 border-green-200";
      case "INACTIVE": return "bg-gray-100 text-gray-700 border-gray-200";
      case "PROSPECT": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getTypeLabel = (type: string) => {
    return type.charAt(0) + type.slice(1).toLowerCase();
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Funders</h1>
          <p className="text-sm text-gray-500 mt-1">Manage grant-making organizations and relationships.</p>
        </div>
        {!isViewer && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Funder
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Create Funder</SheetTitle>
                <SheetDescription>Add a new funder to the database.</SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Funder Name *</FormLabel><FormControl><Input placeholder="e.g. The Big Trust" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="TRUST">Trust</SelectItem>
                            <SelectItem value="FOUNDATION">Foundation</SelectItem>
                            <SelectItem value="GOVERNMENT">Government</SelectItem>
                            <SelectItem value="CORPORATE">Corporate</SelectItem>
                            <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                            <SelectItem value="PROSPECT">Prospect</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="relationshipOwnerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship Owner *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {users?.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="fundingAreas" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Funding Areas (comma separated)</FormLabel>
                      <FormControl><Input placeholder="Youth, Environment, Health" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="typicalGrantMin" render={({ field }) => (
                      <FormItem><FormLabel>Min Grant (£)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="typicalGrantMax" render={({ field }) => (
                      <FormItem><FormLabel>Max Grant (£)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="website" render={({ field }) => (
                    <FormItem><FormLabel>Website</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={createFunder.isPending}>
                      {createFunder.isPending ? "Creating..." : "Create Funder"}
                    </Button>
                  </div>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="h-4 w-4 text-gray-400" />
              <Input 
                placeholder="Search funders..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm border-none shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <Filter className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="TRUST">Trust</SelectItem>
                  <SelectItem value="FOUNDATION">Foundation</SelectItem>
                  <SelectItem value="GOVERNMENT">Government</SelectItem>
                  <SelectItem value="CORPORATE">Corporate</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="PROSPECT">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Funding Areas</TableHead>
                  <TableHead>Grant Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Opps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">Loading funders...</TableCell></TableRow>
                ) : fundersData?.data.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-500">No funders found matching your criteria.</TableCell></TableRow>
                ) : (
                  fundersData?.data.map((funder) => (
                    <TableRow 
                      key={funder.id} 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setLocation(`/funders/${funder.id}`)}
                    >
                      <TableCell className="font-medium text-gray-900">{funder.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 font-medium">
                          {getTypeLabel(funder.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {funder.fundingAreas?.slice(0, 2).map((area, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {area}
                            </Badge>
                          ))}
                          {funder.fundingAreas?.length > 2 && (
                            <span className="text-[10px] text-gray-400">+{funder.fundingAreas.length - 2} more</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {funder.typicalGrantMin || funder.typicalGrantMax ? (
                          `£${funder.typicalGrantMin?.toLocaleString() || 0} - £${funder.typicalGrantMax?.toLocaleString() || '∞'}`
                        ) : (
                          <span className="text-gray-400">Not specified</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] uppercase font-bold ${getStatusColor(funder.status)}`}>
                          {funder.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{funder.ownerName || 'Unassigned'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                          {funder.opportunityCount}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {fundersData && fundersData.totalPages > 1 && (
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
                    Page {fundersData.page} of {fundersData.totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage(p => Math.min(fundersData.totalPages, p + 1))}
                      className={page === fundersData.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
