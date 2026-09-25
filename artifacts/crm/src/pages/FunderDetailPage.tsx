import React, { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, 
  ExternalLink, 
  Mail, 
  Phone, 
  Calendar, 
  Target, 
  UserPlus, 
  Users,
  Trash2, 
  Clock, 
  CheckCircle2, 
  FileText,
  ChevronRight,
  Plus,
  ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type FunderDetail = {
  id: string;
  name: string;
  type: string;
  status: string;
  fundingAreas: string[];
  typicalGrantMin: number | null;
  typicalGrantMax: number | null;
  applicationDeadlines: string | null;
  website: string | null;
  notes: string | null;
  relationshipOwnerId: string;
  ownerName: string;
  contacts: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  }[];
  opportunities: {
    id: string;
    name: string;
    value: number;
    stage: string;
    createdAt: string;
  }[];
  recentActivities: {
    id: string;
    type: string;
    summary: string;
    date: string;
    opportunityId: string;
    userName: string;
  }[];
};

export default function FunderDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'FunderDetailPage' });
  }, []);

  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isViewer, isManager } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const { data: funder, isLoading, error } = useQuery({
    queryKey: ["funders", id],
    queryFn: () => api.get<FunderDetail>(`/funders/${id}`)
  });

  const { data: allContacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api.get<{ data: any[] }>("/contacts?limit=100").then(res => res.data)
  });

  const linkContact = useMutation({
    mutationFn: (contactId: string) => api.post(`/funders/${id}/contacts`, { contactId }),
    onSuccess: () => {
      toast({ title: "Contact linked" });
      setIsLinkDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["funders", id] });
    },
    onError: (err: any) => {
      toast({ title: "Error linking contact", description: err.message, variant: "destructive" });
    }
  });

  const unlinkContact = useMutation({
    mutationFn: (contactId: string) => api.del(`/funders/${id}/contacts/${contactId}`),
    onSuccess: () => {
      toast({ title: "Contact unlinked" });
      queryClient.invalidateQueries({ queryKey: ["funders", id] });
    },
    onError: (err: any) => {
      toast({ title: "Error unlinking contact", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading funder details...</div>;
  if (error || !funder) return <div className="p-8 text-center text-red-500">Error loading funder.</div>;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-green-100 text-green-700 border-green-200";
      case "INACTIVE": return "bg-gray-100 text-gray-700 border-gray-200";
      case "PROSPECT": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "AWARDED": return "bg-green-100 text-green-700";
      case "DECLINED": case "LOST": return "bg-red-100 text-red-700";
      case "PROSPECT": return "bg-blue-100 text-blue-700";
      default: return "bg-amber-100 text-amber-700";
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <Link href="/funders" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Funders
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{funder.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">{funder.type}</Badge>
              <Badge variant="outline" className={`text-[10px] uppercase font-bold ${getStatusColor(funder.status)}`}>{funder.status}</Badge>
              {funder.website && (
                <a 
                  href={funder.website} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isViewer && (
            <Button variant="outline" onClick={() => setLocation(`/funders/${id}/edit`)}>
              Edit Funder
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" /> Funder Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Funding Areas</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {funder.fundingAreas?.length > 0 ? (
                      funder.fundingAreas.map((area, i) => (
                        <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-700 px-2 py-0.5">
                          {area}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">None specified</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Typical Grant Range</label>
                  <p className="text-gray-900 mt-0.5 font-medium">
                    {funder.typicalGrantMin || funder.typicalGrantMax ? (
                      `£${funder.typicalGrantMin?.toLocaleString() || 0} - £${funder.typicalGrantMax?.toLocaleString() || '∞'}`
                    ) : (
                      'Not specified'
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Relationship Owner</label>
                  <p className="text-gray-900 mt-0.5">{funder.ownerName || 'Unassigned'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Application Deadlines</label>
                  <p className="text-gray-900 mt-0.5">{funder.applicationDeadlines || 'Rolling'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Internal Notes</label>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed italic">{funder.notes || 'No notes added yet.'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" /> Linked Contacts
              </CardTitle>
              {!isViewer && (
                <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      <Plus className="h-4 w-4" /> Link Contact
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link a Contact</DialogTitle>
                      <DialogDescription>Select a contact to associate with this funder.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Select onValueChange={setSelectedContactId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select contact..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allContacts?.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.firstName} {c.lastName} ({c.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        className="w-full" 
                        onClick={() => linkContact.mutate(selectedContactId)}
                        disabled={!selectedContactId || linkContact.isPending}
                      >
                        {linkContact.isPending ? "Linking..." : "Link Contact"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funder.contacts.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-gray-400 italic">No contacts linked.</TableCell></TableRow>
                  ) : (
                    funder.contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => setLocation(`/contacts/${contact.id}`)}>
                          {contact.firstName} {contact.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{contact.email}</TableCell>
                        <TableCell className="text-sm text-gray-500">{contact.role}</TableCell>
                        <TableCell className="text-right">
                          {isManager && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => unlinkContact.mutate(contact.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" /> Opportunities
              </CardTitle>
              {!isViewer && (
                <Button size="sm" className="h-8" onClick={() => setLocation(`/pipeline/new?funderId=${id}`)}>
                  <Plus className="h-4 w-4 mr-1" /> New Opportunity
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funder.opportunities.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-gray-400 italic">No opportunities found.</TableCell></TableRow>
                  ) : (
                    funder.opportunities.map((opp) => (
                      <TableRow 
                        key={opp.id} 
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setLocation(`/pipeline/${opp.id}`)}
                      >
                        <TableCell className="font-medium text-gray-900">{opp.name}</TableCell>
                        <TableCell className="text-sm font-semibold">£{opp.value.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase font-bold ${getStageColor(opp.stage)}`}>
                            {opp.stage.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-gray-500">
                          {format(new Date(opp.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-600" /> Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {funder.recentActivities.length === 0 ? (
                  <p className="text-center py-4 text-gray-400 italic text-sm">No recent activities.</p>
                ) : (
                  funder.recentActivities.map((activity, i) => (
                    <div key={activity.id} className="relative pl-6 pb-6 last:pb-0">
                      {i < funder.recentActivities.length - 1 && (
                        <div className="absolute left-[7px] top-6 bottom-0 w-0.5 bg-gray-100" />
                      )}
                      <div className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full bg-blue-100 border-2 border-blue-500" />
                      <div>
                        <div className="flex justify-between items-start">
                          <Badge variant="outline" className="text-[10px] h-4 leading-none px-1 bg-gray-50 text-gray-500 border-gray-100">
                            {activity.type.replace('_', ' ')}
                          </Badge>
                          <span className="text-[10px] text-gray-400 font-medium">{format(new Date(activity.date), 'MMM d, yyyy')}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1.5 font-medium leading-tight">{activity.summary}</p>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Linked to Opportunity
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
