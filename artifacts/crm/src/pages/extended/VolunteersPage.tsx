import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfVolunteers, getYfDbsAlerts, createYfVolunteer, updateYfVolunteer, deleteYfVolunteer, getYfSponsors } from '../../lib/api';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';

const volunteerSchema = z.object({
  sponsorId: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().optional(),
  phone: z.string().optional(),
  dbsStatus: z.string().optional(),
  dbsExpiry: z.string().optional(),
  safeguardingTrainingDate: z.string().optional(),
  skills: z.string().optional(),
  availability: z.string().optional(),
  assignedCoordinator: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

type VolunteerFormValues = z.infer<typeof volunteerSchema>;

const defaultValues: VolunteerFormValues = {
  sponsorId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dbsStatus: 'NOT_STARTED',
  dbsExpiry: '',
  safeguardingTrainingDate: '',
  skills: '',
  availability: '',
  assignedCoordinator: '',
  status: 'PENDING',
  notes: '',
};

export default function VolunteersPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [volunteerToDelete, setVolunteerToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfVolunteers'],
    queryFn: () => getYfVolunteers(),
  });

  const { data: alerts } = useQuery({
    queryKey: ['yfDbsAlerts'],
    queryFn: getYfDbsAlerts,
  });

  const { data: sponsorsData } = useQuery({
    queryKey: ['yfSponsors'],
    queryFn: () => getYfSponsors({}),
  });

  const form = useForm<VolunteerFormValues>({
    resolver: zodResolver(volunteerSchema as any),
    defaultValues: editingVolunteer ? {
      sponsorId: editingVolunteer.sponsorId || '',
      firstName: editingVolunteer.firstName || '',
      lastName: editingVolunteer.lastName || '',
      email: editingVolunteer.email || '',
      phone: editingVolunteer.phone || '',
      dbsStatus: editingVolunteer.dbsStatus || 'NOT_STARTED',
      dbsExpiry: editingVolunteer.dbsExpiry || '',
      safeguardingTrainingDate: editingVolunteer.safeguardingTrainingDate || '',
      skills: editingVolunteer.skills || '',
      availability: editingVolunteer.availability || '',
      assignedCoordinator: editingVolunteer.assignedCoordinator || '',
      status: editingVolunteer.status || 'PENDING',
      notes: editingVolunteer.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingVolunteer) {
      form.reset({
        sponsorId: editingVolunteer.sponsorId || '',
        firstName: editingVolunteer.firstName || '',
        lastName: editingVolunteer.lastName || '',
        email: editingVolunteer.email || '',
        phone: editingVolunteer.phone || '',
        dbsStatus: editingVolunteer.dbsStatus || 'NOT_STARTED',
        dbsExpiry: editingVolunteer.dbsExpiry || '',
        safeguardingTrainingDate: editingVolunteer.safeguardingTrainingDate || '',
        skills: editingVolunteer.skills || '',
        availability: editingVolunteer.availability || '',
        assignedCoordinator: editingVolunteer.assignedCoordinator || '',
        status: editingVolunteer.status || 'PENDING',
        notes: editingVolunteer.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingVolunteer, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfVolunteer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfVolunteers'] });
      queryClient.invalidateQueries({ queryKey: ['yfDbsAlerts'] });
      toast({ title: 'Volunteer created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create volunteer', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfVolunteer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfVolunteers'] });
      queryClient.invalidateQueries({ queryKey: ['yfDbsAlerts'] });
      toast({ title: 'Volunteer updated successfully' });
      setIsSheetOpen(false);
      setEditingVolunteer(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update volunteer', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfVolunteer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfVolunteers'] });
      queryClient.invalidateQueries({ queryKey: ['yfDbsAlerts'] });
      toast({ title: 'Volunteer deleted' });
      setDeleteDialogOpen(false);
      setVolunteerToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete volunteer', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: VolunteerFormValues) => {
    if (editingVolunteer) {
      updateMutation.mutate({ id: editingVolunteer.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (vol: any) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
  };

  const handleDelete = (vol: any) => {
    setVolunteerToDelete(vol);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (volunteerToDelete) {
      deleteMutation.mutate(volunteerToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingVolunteer(null);
    }
  };

  const getDbsBadgeColor = (status: string) => {
    switch(status) {
      case 'CLEAR': return 'bg-green-100 text-green-800 border-green-200';
      case 'PENDING': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'EXPIRED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const sponsors = sponsorsData?.data || [];

  return (
    <div className="p-6 space-y-6">
      {alerts && alerts.length > 0 && (
        <div className={`p-4 rounded-md flex items-center gap-3 ${alerts.some((a: any) => a.dbsStatus === 'EXPIRED') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
          <AlertTriangle className="h-5 w-5" />
          <div className="font-medium">
            Warning: {alerts.length} volunteer(s) have expired or expiring DBS checks.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Volunteers</h1>
        <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Volunteer</Button>
          </SheetTrigger>
          <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingVolunteer ? 'Edit Volunteer' : 'Add Volunteer'}</SheetTitle>
              <SheetDescription>
                {editingVolunteer ? 'Update the volunteer details below.' : 'Fill in the details to add a new volunteer.'}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="sponsorId" render={({ field }) => (
                  <FormItem><FormLabel>Sponsor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select sponsor (optional)" /></SelectTrigger></FormControl>
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
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="dbsStatus" render={({ field }) => (
                    <FormItem><FormLabel>DBS Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="CLEAR">Clear</SelectItem>
                          <SelectItem value="EXPIRED">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="dbsExpiry" render={({ field }) => (
                    <FormItem><FormLabel>DBS Expiry</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="safeguardingTrainingDate" render={({ field }) => (
                  <FormItem><FormLabel>Safeguarding Training Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem><FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="assignedCoordinator" render={({ field }) => (
                    <FormItem><FormLabel>Assigned Coordinator</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="skills" render={({ field }) => (
                  <FormItem><FormLabel>Skills</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem><FormLabel>Availability</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingVolunteer(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingVolunteer ? 'Update' : 'Create'} Volunteer
                  </Button>
                </div>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white rounded-md border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DBS Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DBS Expiry</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.map((vol: any) => (
                <tr key={vol.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/volunteers/${vol.id}`} className="text-blue-600 hover:underline">
                      {vol.firstName} {vol.lastName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={vol.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {vol.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getDbsBadgeColor(vol.dbsStatus)}`}>
                      {vol.dbsStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vol.dbsExpiry ? new Date(vol.dbsExpiry).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(vol)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(vol)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.data?.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No volunteers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{volunteerToDelete?.firstName} {volunteerToDelete?.lastName}"? This action cannot be undone.
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
