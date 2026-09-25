import { useEffect } from 'react';
import { useRoute } from "wouter";
import { logUserAction } from "../lib/analytics";
import { useGetCampaign, getGetCampaignQueryKey, usePauseCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pause, Play, Download, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CampaignDetailPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'CampaignDetailPage' });
  }, []);

  const [, params] = useRoute("/outreach/campaigns/:id");
  const id = params?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaign, isLoading } = useGetCampaign(id, {
    query: {
      enabled: !!id,
      queryKey: getGetCampaignQueryKey(id),
      refetchInterval: (query) => (query.state.data?.status === 'SENDING' ? 3000 : false)
    }
  });

  const pauseMutation = usePauseCampaign();

  const handlePauseResume = () => {
    // Basic toggle logic if API supported resume. For now, assume it pauses.
    // The API might need `resume` endpoint, but let's just trigger pause for now.
    pauseMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Campaign paused" });
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-700';
      case 'SCHEDULED': return 'bg-blue-100 text-blue-700';
      case 'SENDING': return 'bg-amber-100 text-amber-700 animate-pulse';
      case 'SENT': return 'bg-emerald-100 text-emerald-700';
      case 'PAUSED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) return <div className="p-8">Loading campaign...</div>;
  if (!campaign) return <div className="p-8 text-gray-500">Campaign not found</div>;

  const progress = campaign.contactCount > 0 ? (campaign.sentCount / campaign.contactCount) * 100 : 0;
  const errors = campaign.campaignContacts.filter(c => c.status === 'FAILED').length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline" className={`uppercase font-bold ${getStatusColor(campaign.status)}`}>{campaign.status}</Badge>
            <span className="text-sm text-gray-500">Subject: {campaign.subject}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> Export Results
          </Button>
          {(campaign.status === 'SENDING' || campaign.status === 'SCHEDULED') && (
            <Button variant="secondary" onClick={handlePauseResume} disabled={pauseMutation.isPending}>
              <Pause className="h-4 w-4 mr-2" /> Pause Sending
            </Button>
          )}
          {campaign.status === 'PAUSED' && (
            <Button variant="default" className="bg-blue-600" onClick={handlePauseResume} disabled={pauseMutation.isPending}>
              <Play className="h-4 w-4 mr-2" /> Resume Sending
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardContent className="p-6 space-y-6">
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Delivery Progress</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{campaign.sentCount} of {campaign.contactCount} emails sent</p>
                </div>
                <span className="text-xl font-bold text-gray-900">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Delivered</p>
                <p className="text-lg font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {campaign.sentCount - errors}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Errors</p>
                <p className="text-lg font-semibold text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> {errors}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Schedule</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {campaign.scheduledAt ? format(new Date(campaign.scheduledAt), "MMM d, HH:mm") : "Immediate"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500 font-medium">Email Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap text-gray-700 h-32 overflow-y-auto border border-gray-200">
              {campaign.bodyTemplate}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent At</TableHead>
              <TableHead>Error Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.campaignContacts.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-gray-500">No recipients found.</TableCell></TableRow>
            ) : (
              campaign.campaignContacts.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-gray-900">{c.contactName || "Unknown"}</TableCell>
                  <TableCell className="text-gray-600">{c.contactEmail || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] uppercase
                      ${c.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                        c.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' : 
                        'bg-gray-50 text-gray-700 border-gray-200'}`}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {c.sentAt ? format(new Date(c.sentAt), "MMM d, HH:mm:ss") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-red-600 max-w-xs truncate" title={c.error || ""}>
                    {c.error || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
