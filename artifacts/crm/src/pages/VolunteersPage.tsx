import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  Search, 
  Plus, 
  Download, 
  Filter, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldQuestion,
  MoreVertical,
  ExternalLink,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Link } from "wouter";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const volunteerSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  dbsStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "CLEAR", "EXPIRED", "FLAGGED"]),
  dbsCheckedAt: z.string().optional(),
  dbsExpiresAt: z.string().optional(),
  availability: z.string().optional(),
  skills: z.string().optional(), // We'll split this into string[] before sending
  internalNotes: z.string().optional(),
});

type Volunteer = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  organizationId: string | null;
  organizationName: string | null;
  dbsStatus: string;
  dbsCheckedAt: string | null;
  dbsExpiresAt: string | null;
  availability: string | null;
  skills: string[] | null;
  complianceStatus: "COMPLIANT" | "EXPIRING_SOON" | "NON_COMPLIANT";
};

export default function VolunteersPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'VolunteersPage' });
  }, []);

  const { isViewer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [complianceFilter, setComplianceFilter] = useState<string>("all");
  const [dbsFilter, setDbsFilter] = useState<string>("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: volunteersData, isLoading } = useQuery<{ data: Volunteer[]; total: number; page: number; limit: number; totalPages: number }>({
    queryKey: ["volunteers", { search, compliance: complianceFilter, dbsStatus: dbsFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (complianceFilter !== "all") params.append("compliance", complianceFilter);
      if (dbsFilter !== "all") params.append("dbsStatus", dbsFilter);
      params.append("page", String(page));
      params.append("limit", "25");
      return api.get(`/volunteers?${params.toString()}`);
    }
  });

  const volunteers = volunteersData?.data;

  const { data: contacts } = useQuery<any[]>({
    queryKey: ["contacts", "search", contactSearch],
    queryFn: () => api.get(`/contacts?search=${contactSearch}&limit=10`),
    enabled: isSheetOpen && contactSearch.length > 2,
  });

  const createVolunteer = useMutation({
    mutationFn: (data: any) => api.post("/volunteers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteers"] });
      toast({ title: "Volunteer added successfully" });
      setIsSheetOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error adding volunteer", 
        description: error.message || "Something went wrong",
        variant: "destructive" 
      });
    }
  });

  const form = useForm<z.infer<typeof volunteerSchema>>({
    resolver: zodResolver(volunteerSchema as any),
    defaultValues: {
      contactId: "",
      dbsStatus: "NOT_STARTED",
      availability: "",
      skills: "",
      internalNotes: "",
    }
  });

  const onSubmit = (values: z.infer<typeof volunteerSchema>) => {
    const formattedData = {
      ...values,
      skills: values.skills ? values.skills.split(",").map(s => s.trim()) : [],
      dbsCheckedAt: values.dbsCheckedAt || null,
      dbsExpiresAt: values.dbsExpiresAt || null,
    };
    createVolunteer.mutate(formattedData);
  };

  const exportCsv = () => {
    if (!volunteers) return;
    const headers = ["Name", "Organization", "DBS Status", "Compliance", "Expiry", "Skills"];
    const rows = volunteers.map(v => [
      `${v.firstName} ${v.lastName}`,
      v.organizationName || "Independent",
      v.dbsStatus,
      v.complianceStatus,
      v.dbsExpiresAt ? format(new Date(v.dbsExpiresAt), "yyyy-MM-dd") : "N/A",
      (v.skills || []).join(", ")
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `volunteers_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const complianceStats = volunteers?.reduce((acc, v) => {
    acc[v.complianceStatus]++;
    return acc;
  }, { COMPLIANT: 0, EXPIRING_SOON: 0, NON_COMPLIANT: 0 }) || { COMPLIANT: 0, EXPIRING_SOON: 0, NON_COMPLIANT: 0 };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Volunteers</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor volunteer compliance and skills.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!volunteers?.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {!isViewer && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Add Volunteer
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Add New Volunteer</SheetTitle>
                  <SheetDescription>Link a contact as a volunteer and set their DBS status.</SheetDescription>
                </SheetHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
                    <FormField
                      control={form.control}
                      name="contactId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact *</FormLabel>
                          <div className="space-y-2">
                            <Input 
                              placeholder="Search contacts..." 
                              onChange={(e) => setContactSearch(e.target.value)}
                            />
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a contact" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {contacts?.map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.firstName} {c.lastName} ({c.email})
                                  </SelectItem>
                                ))}
                                {(!contacts || contacts.length === 0) && (
                                  <div className="p-2 text-sm text-muted-foreground text-center">
                                    {contactSearch.length > 2 ? "No contacts found" : "Type 3+ chars to search"}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="dbsStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>DBS Status *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                              <SelectItem value="CLEAR">Clear</SelectItem>
                              <SelectItem value="EXPIRED">Expired</SelectItem>
                              <SelectItem value="FLAGGED">Flagged</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="dbsCheckedAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Checked At</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dbsExpiresAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expires At</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="skills"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Skills (comma separated)</FormLabel>
                          <FormControl>
                            <Input placeholder="Mentoring, Driving, Fundraising" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="availability"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Availability</FormLabel>
                          <FormControl>
                            <Input placeholder="Weekends, Tuesday evenings" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="internalNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Internal Notes</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-4">
                      <Button type="submit" className="w-full" disabled={createVolunteer.isPending}>
                        {createVolunteer.isPending ? "Adding..." : "Add Volunteer"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800 flex items-center">
              <ShieldCheck className="mr-2 h-4 w-4" /> Compliant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{complianceStats.COMPLIANT}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-800 flex items-center">
              <ShieldAlert className="mr-2 h-4 w-4" /> Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{complianceStats.EXPIRING_SOON}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-800 flex items-center">
              <ShieldQuestion className="mr-2 h-4 w-4" /> Non-Compliant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">{complianceStats.NON_COMPLIANT}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or organization..." 
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={complianceFilter} onValueChange={setComplianceFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Compliance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Compliance</SelectItem>
              <SelectItem value="COMPLIANT">Compliant</SelectItem>
              <SelectItem value="EXPIRING_SOON">Expiring Soon</SelectItem>
              <SelectItem value="NON_COMPLIANT">Non-Compliant</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dbsFilter} onValueChange={setDbsFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="DBS Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All DBS Status</SelectItem>
              <SelectItem value="CLEAR">Clear</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="FLAGGED">Flagged</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>DBS Status</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : volunteers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No volunteers found.
                </TableCell>
              </TableRow>
            ) : (
              volunteers?.map((volunteer) => (
                <TableRow key={volunteer.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link href={`/volunteers/${volunteer.id}`} className="hover:underline">
                      {volunteer.firstName} {volunteer.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{volunteer.organizationName || "Independent"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={
                      volunteer.dbsStatus === "CLEAR" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                      volunteer.dbsStatus === "FLAGGED" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                      "bg-gray-100 text-gray-800 hover:bg-gray-100"
                    }>
                      {volunteer.dbsStatus.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      volunteer.complianceStatus === "COMPLIANT" ? "border-green-500 text-green-700" :
                      volunteer.complianceStatus === "EXPIRING_SOON" ? "border-amber-500 text-amber-700" :
                      "border-red-500 text-red-700"
                    }>
                      {volunteer.complianceStatus.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {volunteer.dbsExpiresAt ? format(new Date(volunteer.dbsExpiresAt), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {volunteer.skills?.slice(0, 2).map((skill, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{skill}</Badge>
                      ))}
                      {(volunteer.skills?.length || 0) > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{volunteer.skills!.length - 2} more</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/volunteers/${volunteer.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/contacts/${volunteer.contactId}`}>View Contact <ExternalLink className="ml-2 h-3 w-3" /></Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {volunteersData && volunteersData.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="px-4 text-sm text-gray-500">
              Page {volunteersData.page} of {volunteersData.totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(volunteersData.totalPages, p + 1))}
                className={page === volunteersData.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
