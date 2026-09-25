import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfFunding, getYfUpcomingRenewals, createYfFunding, updateYfFunding, deleteYfFunding, getYfSponsors } from '../../lib/api';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react';

const fundingSchema = z.object({
  sponsorId: z.string().min(1, 'Sponsor is required'),
  fundingType: z.string().optional(),
  amount: z.string().optional(),
  stage: z.string().optional(),
  renewalDate: z.string().optional(),
  reportingRequired: z.boolean().optional(),
  reportingDeadline: z.string().optional(),
  notes: z.string().optional(),
});

type FundingFormValues = z.infer<typeof fundingSchema>;

const defaultValues: FundingFormValues = {
  sponsorId: '',
  fundingType: '',
  amount: '',
  stage: '',
  renewalDate: '',
  reportingRequired: false,
  reportingDeadline: '',
  notes: '',
};

export default function FundingPage() {
  const [search, setSearch] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingFunding, setEditingFunding] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fundingToDelete, setFundingToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfFunding', { search }],
    queryFn: () => getYfFunding({ search }),
  });

  const { data: renewals } = useQuery({
    queryKey: ['yfFundingRenewals'],
    queryFn: getYfUpcomingRenewals,
  });

  const { data: sponsorsData } = useQuery({
    queryKey: ['yfSponsors'],
    queryFn: () => getYfSponsors({}),
  });

  const form = useForm<FundingFormValues>({
    resolver: zodResolver(fundingSchema as any),
    defaultValues: editingFunding ? {
      sponsorId: editingFunding.sponsorId || '',
      fundingType: editingFunding.fundingType || '',
      amount: editingFunding.amount ? String(editingFunding.amount) : '',
      stage: editingFunding.stage || '',
      renewalDate: editingFunding.renewalDate || '',
      reportingRequired: editingFunding.reportingRequired || false,
      reportingDeadline: editingFunding.reportingDeadline || '',
      notes: editingFunding.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingFunding) {
      form.reset({
        sponsorId: editingFunding.sponsorId || '',
        fundingType: editingFunding.fundingType || '',
        amount: editingFunding.amount ? String(editingFunding.amount) : '',
        stage: editingFunding.stage || '',
        renewalDate: editingFunding.renewalDate || '',
        reportingRequired: editingFunding.reportingRequired || false,
        reportingDeadline: editingFunding.reportingDeadline || '',
        notes: editingFunding.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingFunding, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfFunding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfFunding'] });
      queryClient.invalidateQueries({ queryKey: ['yfFundingRenewals'] });
      toast({ title: 'Funding opportunity created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create funding opportunity', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfFunding(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfFunding'] });
      queryClient.invalidateQueries({ queryKey: ['yfFundingRenewals'] });
      toast({ title: 'Funding opportunity updated successfully' });
      setIsSheetOpen(false);
      setEditingFunding(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update funding opportunity', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfFunding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfFunding'] });
      queryClient.invalidateQueries({ queryKey: ['yfFundingRenewals'] });
      toast({ title: 'Funding opportunity deleted' });
      setDeleteDialogOpen(false);
      setFundingToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete funding opportunity', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: FundingFormValues) => {
    const payload = {
      ...values,
      amount: values.amount ? parseFloat(values.amount) : undefined,
      reportingRequired: values.reportingRequired || false,
    };
    if (editingFunding) {
      updateMutation.mutate({ id: editingFunding.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: any) => {
    setEditingFunding(item);
    setIsSheetOpen(true);
  };

  const handleDelete = (item: any) => {
    setFundingToDelete(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (fundingToDelete) {
      deleteMutation.mutate(fundingToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingFunding(null);
    }
  };

  const stageColor = (stage: string) => {
    switch (stage) {
      case 'ACTIVE': case 'AGREED': return 'default';
      case 'PROSPECT': return 'secondary';
      case 'PROPOSAL_SENT': return 'outline';
      case 'COMPLETED': return 'secondary';
      case 'DECLINED': return 'destructive';
      default: return 'secondary';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  const sponsors = sponsorsData?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Funding Opportunities</h1>
        <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Funding Opportunity</Button>
          </SheetTrigger>
          <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingFunding ? 'Edit Funding Opportunity' : 'Add Funding Opportunity'}</SheetTitle>
              <SheetDescription>
                {editingFunding ? 'Update the funding details below.' : 'Fill in the details to add a new funding opportunity.'}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField control={form.control} name="sponsorId" render={({ field }) => (
                  <FormItem><FormLabel>Sponsor *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select sponsor" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {sponsors.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.organisationName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="fundingType" render={({ field }) => (
                    <FormItem><FormLabel>Funding Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="GRANT">Grant</SelectItem>
                          <SelectItem value="CSR">CSR</SelectItem>
                          <SelectItem value="CONTRACT">Contract</SelectItem>
                          <SelectItem value="IN_KIND">In Kind</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="stage" render={({ field }) => (
                    <FormItem><FormLabel>Stage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="PROSPECT">Prospect</SelectItem>
                          <SelectItem value="PROPOSAL_SENT">Proposal Sent</SelectItem>
                          <SelectItem value="AGREED">Agreed</SelectItem>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="DECLINED">Declined</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem><FormLabel>Amount (£)</FormLabel><FormControl><Input {...field} type="number" step="0.01" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="renewalDate" render={({ field }) => (
                  <FormItem><FormLabel>Renewal Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="reportingRequired" render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl><input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /></FormControl>
                    <FormLabel className="!mt-0">Reporting Required</FormLabel>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reportingDeadline" render={({ field }) => (
                  <FormItem><FormLabel>Reporting Deadline</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingFunding(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingFunding ? 'Update' : 'Create'} Opportunity
                  </Button>
                </div>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>

      {renewals && renewals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Upcoming Renewals (next 90 days)</h3>
          </div>
          <div className="space-y-2">
            {renewals.map((r: any) => (
              <div key={r.id} className="flex justify-between items-center text-sm">
                <Link href={`/ext/funding/${r.id}`} className="text-blue-600 hover:underline">
                  {r.sponsorName || 'Unknown Sponsor'} — {r.fundingType}
                </Link>
                <span className="text-amber-700 font-medium">{r.renewalDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Input
          placeholder="Search funding opportunities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="bg-white rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sponsor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Renewal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reporting</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.data?.map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/ext/funding/${item.id}`} className="text-blue-600 hover:underline">
                        {item.sponsorName || 'Unknown'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.fundingType || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.amount ? formatCurrency(item.amount) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={stageColor(item.stage)}>{item.stage}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.renewalDate || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.reportingRequired ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.data?.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No funding opportunities found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Funding Opportunity</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this funding opportunity? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
