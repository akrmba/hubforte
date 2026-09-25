import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfSchools, createYfSchool, updateYfSchool, deleteYfSchool, getYfTrusts } from '../../lib/api';
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
import SchoolsPipelinePage from './SchoolsPipelinePage';

const schoolSchema = z.object({
  schoolName: z.string().min(1, 'School name is required'),
  urn: z.string().optional(),
  phase: z.string().optional(),
  trustId: z.string().optional(),
  address: z.string().optional(),
  postcode: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  headteacher: z.string().optional(),
  dsl: z.string().optional(),
  senco: z.string().optional(),
  headOfSixthForm: z.string().optional(),
  careersLead: z.string().optional(),
  relationshipStatus: z.string().optional(),
  deliveryStatus: z.string().optional(),
  notes: z.string().optional(),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

const defaultValues: SchoolFormValues = {
  schoolName: '',
  urn: '',
  phase: '',
  trustId: '',
  address: '',
  postcode: '',
  website: '',
  phone: '',
  headteacher: '',
  dsl: '',
  senco: '',
  headOfSixthForm: '',
  careersLead: '',
  relationshipStatus: 'PROSPECT',
  deliveryStatus: 'NONE',
  notes: '',
};

export default function SchoolsPage() {
  const [view, setView] = useState<'LIST' | 'PIPELINE'>('LIST');
  const [search, setSearch] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [schoolToDelete, setSchoolToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfSchools', { search }],
    queryFn: () => getYfSchools({ search }),
    enabled: view === 'LIST'
  });

  const { data: trustsData } = useQuery({
    queryKey: ['yfTrusts'],
    queryFn: () => getYfTrusts({}),
  });

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolSchema as any),
    defaultValues: editingSchool ? {
      schoolName: editingSchool.schoolName || '',
      urn: editingSchool.urn || '',
      phase: editingSchool.phase || '',
      trustId: editingSchool.trustId || '',
      address: editingSchool.address || '',
      postcode: editingSchool.postcode || '',
      website: editingSchool.website || '',
      phone: editingSchool.phone || '',
      headteacher: editingSchool.headteacher || '',
      dsl: editingSchool.dsl || '',
      senco: editingSchool.senco || '',
      headOfSixthForm: editingSchool.headOfSixthForm || '',
      careersLead: editingSchool.careersLead || '',
      relationshipStatus: editingSchool.relationshipStatus || 'PROSPECT',
      deliveryStatus: editingSchool.deliveryStatus || 'NONE',
      notes: editingSchool.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingSchool) {
      form.reset({
        schoolName: editingSchool.schoolName || '',
        urn: editingSchool.urn || '',
        phase: editingSchool.phase || '',
        trustId: editingSchool.trustId || '',
        address: editingSchool.address || '',
        postcode: editingSchool.postcode || '',
        website: editingSchool.website || '',
        phone: editingSchool.phone || '',
        headteacher: editingSchool.headteacher || '',
        dsl: editingSchool.dsl || '',
        senco: editingSchool.senco || '',
        headOfSixthForm: editingSchool.headOfSixthForm || '',
        careersLead: editingSchool.careersLead || '',
        relationshipStatus: editingSchool.relationshipStatus || 'PROSPECT',
        deliveryStatus: editingSchool.deliveryStatus || 'NONE',
        notes: editingSchool.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingSchool, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfSchool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfSchools'] });
      toast({ title: 'School created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create school', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfSchool(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfSchools'] });
      toast({ title: 'School updated successfully' });
      setIsSheetOpen(false);
      setEditingSchool(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update school', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfSchool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfSchools'] });
      toast({ title: 'School deleted' });
      setDeleteDialogOpen(false);
      setSchoolToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete school', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: SchoolFormValues) => {
    if (editingSchool) {
      updateMutation.mutate({ id: editingSchool.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (school: any) => {
    setEditingSchool(school);
    setIsSheetOpen(true);
  };

  const handleDelete = (school: any) => {
    setSchoolToDelete(school);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (schoolToDelete) {
      deleteMutation.mutate(schoolToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingSchool(null);
    }
  };

  const trusts = trustsData?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Schools</h1>
        <div className="flex gap-2">
          <div className="bg-gray-100 p-1 rounded-md flex">
            <button
              className={`px-3 py-1 rounded-md text-sm font-medium ${view === 'LIST' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setView('LIST')}
            >
              List
            </button>
            <button
              className={`px-3 py-1 rounded-md text-sm font-medium ${view === 'PIPELINE' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setView('PIPELINE')}
            >
              Pipeline
            </button>
          </div>
          <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add School</Button>
            </SheetTrigger>
            <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{editingSchool ? 'Edit School' : 'Add School'}</SheetTitle>
                <SheetDescription>
                  {editingSchool ? 'Update the school details below.' : 'Fill in the details to add a new school.'}
                </SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="schoolName" render={({ field }) => (
                    <FormItem><FormLabel>School Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="urn" render={({ field }) => (
                      <FormItem><FormLabel>URN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phase" render={({ field }) => (
                      <FormItem><FormLabel>Phase</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="PRIMARY">Primary</SelectItem>
                            <SelectItem value="SECONDARY">Secondary</SelectItem>
                            <SelectItem value="ALL_THROUGH">All Through</SelectItem>
                            <SelectItem value="SPECIAL">Special</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="trustId" render={({ field }) => (
                    <FormItem><FormLabel>Trust</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select trust (optional)" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {trusts.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.trustName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="relationshipStatus" render={({ field }) => (
                      <FormItem><FormLabel>Relationship</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="PROSPECT">Prospect</SelectItem>
                            <SelectItem value="CONTACTED">Contacted</SelectItem>
                            <SelectItem value="MEETING_HELD">Meeting Held</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="LAPSED">Lapsed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="deliveryStatus" render={({ field }) => (
                      <FormItem><FormLabel>Delivery</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="NONE">None</SelectItem>
                            <SelectItem value="PILOT">Pilot</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="PAUSED">Paused</SelectItem>
                            <SelectItem value="ENDED">Ended</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
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
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="postcode" render={({ field }) => (
                    <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="headteacher" render={({ field }) => (
                      <FormItem><FormLabel>Headteacher</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="dsl" render={({ field }) => (
                      <FormItem><FormLabel>DSL</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="senco" render={({ field }) => (
                      <FormItem><FormLabel>SENCO</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="careersLead" render={({ field }) => (
                      <FormItem><FormLabel>Careers Lead</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingSchool(null); }}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingSchool ? 'Update' : 'Create'} School
                    </Button>
                  </div>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {view === 'LIST' ? (
        <div className="space-y-4">
          <Input
            placeholder="Search schools or URN..."
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">School</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Relationship</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data?.data?.map((school: any) => (
                    <tr key={school.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link href={`/ext/schools/${school.id}`} className="text-blue-600 hover:underline">
                          {school.schoolName}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.urn}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{school.phase}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="outline">{school.relationshipStatus}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary">{school.deliveryStatus}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(school)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(school)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data?.data?.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No schools found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <SchoolsPipelinePage />
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete School</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{schoolToDelete?.schoolName}"? This action cannot be undone.
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
