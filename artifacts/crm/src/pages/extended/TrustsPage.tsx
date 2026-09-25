import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfTrusts, createYfTrust, updateYfTrust, deleteYfTrust } from '../../lib/api';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';

const trustSchema = z.object({
  trustName: z.string().min(1, 'Trust name is required'),
  trustType: z.string().optional(),
  ceo: z.string().optional(),
  educationLead: z.string().optional(),
  safeguardingLead: z.string().optional(),
  region: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  headOfficeAddress: z.string().optional(),
  postcode: z.string().optional(),
  notes: z.string().optional(),
});

type TrustFormValues = z.infer<typeof trustSchema>;

const defaultValues: TrustFormValues = {
  trustName: '',
  trustType: '',
  ceo: '',
  educationLead: '',
  safeguardingLead: '',
  region: '',
  website: '',
  phone: '',
  email: '',
  headOfficeAddress: '',
  postcode: '',
  notes: '',
};

export default function TrustsPage() {
  const [search, setSearch] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTrust, setEditingTrust] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trustToDelete, setTrustToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfTrusts', { search }],
    queryFn: () => getYfTrusts({ search }),
  });

  const form = useForm<TrustFormValues>({
    resolver: zodResolver(trustSchema as any),
    defaultValues: editingTrust ? {
      trustName: editingTrust.trustName || '',
      trustType: editingTrust.trustType || '',
      ceo: editingTrust.ceo || '',
      educationLead: editingTrust.educationLead || '',
      safeguardingLead: editingTrust.safeguardingLead || '',
      region: editingTrust.region || '',
      website: editingTrust.website || '',
      phone: editingTrust.phone || '',
      email: editingTrust.email || '',
      headOfficeAddress: editingTrust.headOfficeAddress || '',
      postcode: editingTrust.postcode || '',
      notes: editingTrust.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingTrust) {
      form.reset({
        trustName: editingTrust.trustName || '',
        trustType: editingTrust.trustType || '',
        ceo: editingTrust.ceo || '',
        educationLead: editingTrust.educationLead || '',
        safeguardingLead: editingTrust.safeguardingLead || '',
        region: editingTrust.region || '',
        website: editingTrust.website || '',
        phone: editingTrust.phone || '',
        email: editingTrust.email || '',
        headOfficeAddress: editingTrust.headOfficeAddress || '',
        postcode: editingTrust.postcode || '',
        notes: editingTrust.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingTrust, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfTrust,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfTrusts'] });
      toast({ title: 'Trust created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create trust', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfTrust(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfTrusts'] });
      toast({ title: 'Trust updated successfully' });
      setIsSheetOpen(false);
      setEditingTrust(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update trust', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfTrust(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfTrusts'] });
      toast({ title: 'Trust deleted' });
      setDeleteDialogOpen(false);
      setTrustToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete trust', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: TrustFormValues) => {
    if (editingTrust) {
      updateMutation.mutate({ id: editingTrust.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (trust: any) => {
    setEditingTrust(trust);
    setIsSheetOpen(true);
  };

  const handleDelete = (trust: any) => {
    setTrustToDelete(trust);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (trustToDelete) {
      deleteMutation.mutate(trustToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingTrust(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'default';
      case 'PROSPECT': return 'secondary';
      case 'CONTACTED': return 'outline';
      case 'MEETING_HELD': return 'outline';
      case 'LAPSED': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Trusts</h1>
        <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Trust</Button>
          </SheetTrigger>
          <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingTrust ? 'Edit Trust' : 'Add Trust'}</SheetTitle>
              <SheetDescription>
                {editingTrust ? 'Update the trust details below.' : 'Fill in the details to add a new trust.'}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField control={form.control} name="trustName" render={({ field }) => (
                  <FormItem><FormLabel>Trust Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="trustType" render={({ field }) => (
                    <FormItem><FormLabel>Trust Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="MAT">MAT</SelectItem>
                          <SelectItem value="SAT">SAT</SelectItem>
                          <SelectItem value="LA_MAINTAINED">LA Maintained</SelectItem>
                          <SelectItem value="STANDALONE">Standalone</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="region" render={({ field }) => (
                    <FormItem><FormLabel>Region</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="ceo" render={({ field }) => (
                  <FormItem><FormLabel>CEO</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="educationLead" render={({ field }) => (
                    <FormItem><FormLabel>Education Lead</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="safeguardingLead" render={({ field }) => (
                    <FormItem><FormLabel>Safeguarding Lead</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="website" render={({ field }) => (
                    <FormItem><FormLabel>Website</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="headOfficeAddress" render={({ field }) => (
                  <FormItem><FormLabel>Head Office Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="postcode" render={({ field }) => (
                  <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingTrust(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingTrust ? 'Update' : 'Create'} Trust
                  </Button>
                </div>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4">
        <Input
          placeholder="Search trusts..."
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trust Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Relationship</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schools</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.data?.map((trust: any) => (
                  <tr key={trust.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/ext/trusts/${trust.id}`} className="text-blue-600 hover:underline">
                        {trust.trustName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{trust.trustType || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{trust.region || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={statusColor(trust.relationshipStatus)}>{trust.relationshipStatus}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{trust.numberOfSchools || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(trust)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(trust)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.data?.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No trusts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Trust</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{trustToDelete?.trustName}"? This action cannot be undone.
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
