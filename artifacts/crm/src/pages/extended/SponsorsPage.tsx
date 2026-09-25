import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfSponsors, createYfSponsor } from '../../lib/api';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

export default function SponsorsPage() {
  const [search, setSearch] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    organisationName: '', sector: '', website: '', csrPriority: '',
    employeeVolunteeringInterest: false, relationshipStatus: '', region: '', notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['yfSponsors', { search }],
    queryFn: () => getYfSponsors({ search }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => createYfSponsor(data),
    onSuccess: () => {
      toast({ title: "Sponsor created successfully" });
      setIsSheetOpen(false);
      setForm({ organisationName: '', sector: '', website: '', csrPriority: '', employeeVolunteeringInterest: false, relationshipStatus: '', region: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['yfSponsors'] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create sponsor", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organisationName) {
      toast({ title: "Organisation name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...form,
      relationshipStatus: form.relationshipStatus || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Sponsors</h1>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Sponsor</Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Sponsor</SheetTitle>
              <SheetDescription>Create a new sponsor organisation.</SheetDescription>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="organisationName">Organisation Name *</Label>
                <Input id="organisationName" value={form.organisationName} onChange={e => setForm(f => ({ ...f, organisationName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector">Sector</Label>
                <Input id="sector" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="csrPriority">CSR Priority</Label>
                <Input id="csrPriority" value={form.csrPriority} onChange={e => setForm(f => ({ ...f, csrPriority: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Relationship Status</Label>
                <Select value={form.relationshipStatus} onValueChange={v => setForm(f => ({ ...f, relationshipStatus: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROSPECT">Prospect</SelectItem>
                    <SelectItem value="CONTACTED">Contacted</SelectItem>
                    <SelectItem value="MEETING_HELD">Meeting Held</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="LAPSED">Lapsed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.employeeVolunteeringInterest} onChange={e => setForm(f => ({ ...f, employeeVolunteeringInterest: e.target.checked }))} className="rounded" />
                Employee Volunteering Interest
              </label>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Sponsor"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex gap-4">
        <Input 
          placeholder="Search sponsors..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white rounded-md border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organisation</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sector</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.map((sponsor: any) => (
                <tr key={sponsor.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/sponsors/${sponsor.id}`} className="text-blue-600 hover:underline">
                      {sponsor.organisationName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sponsor.sector}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sponsor.region}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline">{sponsor.relationshipStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
