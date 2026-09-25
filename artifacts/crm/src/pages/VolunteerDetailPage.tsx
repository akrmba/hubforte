import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShieldQuestion, 
  ChevronLeft,
  Calendar,
  Building,
  Mail,
  Phone,
  Tag,
  Clock,
  CheckCircle2,
  ExternalLink,
  Edit2,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Link, useLocation, useParams } from "wouter";

const updateDbsSchema = z.object({
  dbsStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "CLEAR", "EXPIRED", "FLAGGED"]),
  dbsCheckedAt: z.string().optional(),
  dbsExpiresAt: z.string().optional(),
});

const updateVolunteerSchema = z.object({
  availability: z.string().optional(),
  skills: z.string().optional(),
  internalNotes: z.string().optional(),
  references: z.string().optional(),
});

type VolunteerDetail = {
  id: string;
  contactId: string;
  dbsStatus: string;
  dbsCheckedAt: string | null;
  dbsExpiresAt: string | null;
  availability: string | null;
  skills: string[] | null;
  references: string[] | null;
  internalNotes: string | null;
  complianceStatus: "COMPLIANT" | "EXPIRING_SOON" | "NON_COMPLIANT";
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    organizationId: string | null;
  };
  organization: {
    id: string;
    name: string;
  } | null;
};

export default function VolunteerDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'VolunteerDetailPage' });
  }, []);

  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isViewer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDbsSheetOpen, setIsDbsSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  const { data: volunteer, isLoading } = useQuery<VolunteerDetail>({
    queryKey: ["volunteers", id],
    queryFn: () => api.get(`/volunteers/${id}`),
    enabled: !!id,
  });

  const updateVolunteer = useMutation({
    mutationFn: (data: any) => api.patch(`/volunteers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteers", id] });
      queryClient.invalidateQueries({ queryKey: ["volunteers"] });
      toast({ title: "Volunteer updated successfully" });
      setIsDbsSheetOpen(false);
      setIsEditSheetOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Update failed", 
        description: error.message || "Something went wrong",
        variant: "destructive" 
      });
    }
  });

  const dbsForm = useForm<z.infer<typeof updateDbsSchema>>({
    resolver: zodResolver(updateDbsSchema as any),
  });

  const editForm = useForm<z.infer<typeof updateVolunteerSchema>>({
    resolver: zodResolver(updateVolunteerSchema as any),
  });

  // Reset forms when data loads
  React.useEffect(() => {
    if (volunteer) {
      dbsForm.reset({
        dbsStatus: volunteer.dbsStatus as any,
        dbsCheckedAt: volunteer.dbsCheckedAt ? format(new Date(volunteer.dbsCheckedAt), "yyyy-MM-dd") : "",
        dbsExpiresAt: volunteer.dbsExpiresAt ? format(new Date(volunteer.dbsExpiresAt), "yyyy-MM-dd") : "",
      });
      editForm.reset({
        availability: volunteer.availability || "",
        skills: volunteer.skills?.join(", ") || "",
        internalNotes: volunteer.internalNotes || "",
        references: volunteer.references?.join("\n") || "",
      });
    }
  }, [volunteer, dbsForm, editForm]);

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!volunteer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold">Volunteer not found</h2>
        <Button variant="link" onClick={() => setLocation("/volunteers")}>
          Back to list
        </Button>
      </div>
    );
  }

  const onDbsSubmit = (values: z.infer<typeof updateDbsSchema>) => {
    updateVolunteer.mutate({
      ...values,
      dbsCheckedAt: values.dbsCheckedAt || null,
      dbsExpiresAt: values.dbsExpiresAt || null,
    });
  };

  const onEditSubmit = (values: z.infer<typeof updateVolunteerSchema>) => {
    updateVolunteer.mutate({
      ...values,
      skills: values.skills ? values.skills.split(",").map(s => s.trim()) : [],
      references: values.references ? values.references.split("\n").map(r => r.trim()).filter(Boolean) : [],
    });
  };

  const ComplianceBadge = ({ status }: { status: string }) => {
    switch (status) {
      case "COMPLIANT":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
          <ShieldCheck className="w-3 h-3 mr-1" /> Compliant
        </Badge>;
      case "EXPIRING_SOON":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
          <ShieldAlert className="w-3 h-3 mr-1" /> Expiring Soon
        </Badge>;
      default:
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
          <ShieldQuestion className="w-3 h-3 mr-1" /> Non-Compliant
        </Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/volunteers" className="hover:text-foreground flex items-center">
          <ChevronLeft className="h-4 w-4" /> Volunteers
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {volunteer.contact.firstName} {volunteer.contact.lastName}
            </h1>
            <ComplianceBadge status={volunteer.complianceStatus} />
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            <Building className="h-4 w-4" /> {volunteer.organization?.name || "Independent"}
          </p>
        </div>
        <div className="flex gap-2">
          {!isViewer && (
            <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Edit2 className="h-4 w-4 mr-2" /> Edit Volunteer Info
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Edit Volunteer Info</SheetTitle>
                  <SheetDescription>Update skills, availability, and references.</SheetDescription>
                </SheetHeader>
                <Form {...editForm}>
                  <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 mt-6">
                    <FormField
                      control={editForm.control}
                      name="skills"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Skills (comma separated)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="availability"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Availability</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="references"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>References (one per line)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="internalNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Internal Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={4} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="pt-4">
                      <Button type="submit" className="w-full" disabled={updateVolunteer.isPending}>
                        {updateVolunteer.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
          <Button asChild>
            <Link href={`/contacts/${volunteer.contactId}`}>
              View Contact Profile <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">DBS Background Check</CardTitle>
              {!isViewer && (
                <Sheet open={isDbsSheetOpen} onOpenChange={setIsDbsSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">Update DBS Status</Button>
                  </SheetTrigger>
                  <SheetContent className="sm:max-w-md">
                    <SheetHeader>
                      <SheetTitle>Update DBS Status</SheetTitle>
                      <SheetDescription>Change the background check status and expiry dates.</SheetDescription>
                    </SheetHeader>
                    <Form {...dbsForm}>
                      <form onSubmit={dbsForm.handleSubmit(onDbsSubmit)} className="space-y-4 mt-6">
                        <FormField
                          control={dbsForm.control}
                          name="dbsStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
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
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={dbsForm.control}
                          name="dbsCheckedAt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Checked At</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={dbsForm.control}
                          name="dbsExpiresAt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Expires At</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormDescription className="text-[10px]">
                                If status changes to CLEAR and this is empty, it will auto-set to 3 years from today.
                              </FormDescription>
                            </FormItem>
                          )}
                        />
                        <div className="pt-4">
                          <Button type="submit" className="w-full" disabled={updateVolunteer.isPending}>
                            {updateVolunteer.isPending ? "Updating..." : "Update Status"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </SheetContent>
                </Sheet>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm px-2 py-0.5">
                      {volunteer.dbsStatus.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked At</p>
                  <p className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {volunteer.dbsCheckedAt ? format(new Date(volunteer.dbsCheckedAt), "MMM d, yyyy") : "Never"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires At</p>
                  <p className={`text-sm flex items-center gap-2 font-medium ${volunteer.complianceStatus !== "COMPLIANT" ? "text-amber-600" : ""}`}>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {volunteer.dbsExpiresAt ? format(new Date(volunteer.dbsExpiresAt), "MMM d, yyyy") : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Skills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {volunteer.skills && volunteer.skills.length > 0 ? (
                    volunteer.skills.map((skill, i) => (
                      <Badge key={i} variant="secondary">{skill}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No skills listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Availability
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {volunteer.availability || <span className="text-muted-foreground italic">No availability information</span>}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Internal Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/30 p-4 rounded-lg min-h-[100px] text-sm whitespace-pre-wrap">
                {volunteer.internalNotes || "No internal notes provided."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{volunteer.contact.email || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{volunteer.contact.phone || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">References</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {volunteer.references && volunteer.references.length > 0 ? (
                  volunteer.references.map((ref, i) => (
                    <li key={i} className="text-sm border-l-2 border-primary/20 pl-3 py-1">
                      {ref}
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">No references listed</p>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
