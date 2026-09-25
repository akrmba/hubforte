import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfProgrammes, createYfProgramme, updateYfProgramme, deleteYfProgramme, getYfSchools, getYfFunding } from '../../lib/api';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';

const programmeSchema = z.object({
  schoolId: z.string().min(1, 'School is required'),
  programmeName: z.string().min(1, 'Programme name is required'),
  programmeType: z.string().optional(),
  yearGroup: z.string().optional(),
  fundingOpportunityId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
  studentCount: z.string().optional(),
  notes: z.string().optional(),
});

type ProgrammeFormValues = z.infer<typeof programmeSchema>;

const defaultValues: ProgrammeFormValues = {
  schoolId: '',
  programmeName: '',
  programmeType: '',
  yearGroup: '',
  fundingOpportunityId: '',
  startDate: '',
  endDate: '',
  status: 'PLANNED',
  studentCount: '0',
  notes: '',
};

export default function ProgrammesPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programmeToDelete, setProgrammeToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfProgrammes'],
    queryFn: () => getYfProgrammes(),
  });

  const { data: schoolsData } = useQuery({
    queryKey: ['yfSchools'],
    queryFn: () => getYfSchools({}),
  });

  const { data: fundingData } = useQuery({
    queryKey: ['yfFunding'],
    queryFn: () => getYfFunding({}),
  });

  const form = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeSchema as any),
    defaultValues: editingProgramme ? {
      schoolId: editingProgramme.schoolId || '',
      programmeName: editingProgramme.programmeName || '',
      programmeType: editingProgramme.programmeType || '',
      yearGroup: editingProgramme.yearGroup || '',
      fundingOpportunityId: editingProgramme.fundingOpportunityId || '',
      startDate: editingProgramme.startDate || '',
      endDate: editingProgramme.endDate || '',
      status: editingProgramme.status || 'PLANNED',
      studentCount: editingProgramme.studentCount ? String(editingProgramme.studentCount) : '0',
      notes: editingProgramme.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingProgramme) {
      form.reset({
        schoolId: editingProgramme.schoolId || '',
        programmeName: editingProgramme.programmeName || '',
        programmeType: editingProgramme.programmeType || '',
        yearGroup: editingProgramme.yearGroup || '',
        fundingOpportunityId: editingProgramme.fundingOpportunityId || '',
        startDate: editingProgramme.startDate || '',
        endDate: editingProgramme.endDate || '',
        status: editingProgramme.status || 'PLANNED',
        studentCount: editingProgramme.studentCount ? String(editingProgramme.studentCount) : '0',
        notes: editingProgramme.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingProgramme, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfProgramme,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfProgrammes'] });
      toast({ title: 'Programme created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create programme', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfProgramme(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfProgrammes'] });
      toast({ title: 'Programme updated successfully' });
      setIsSheetOpen(false);
      setEditingProgramme(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update programme', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfProgramme(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfProgrammes'] });
      toast({ title: 'Programme deleted' });
      setDeleteDialogOpen(false);
      setProgrammeToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete programme', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: ProgrammeFormValues) => {
    const payload = {
      ...values,
      studentCount: values.studentCount ? parseInt(values.studentCount, 10) : 0,
    };
    if (editingProgramme) {
      updateMutation.mutate({ id: editingProgramme.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (prog: any) => {
    setEditingProgramme(prog);
    setIsSheetOpen(true);
  };

  const handleDelete = (prog: any) => {
    setProgrammeToDelete(prog);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (programmeToDelete) {
      deleteMutation.mutate(programmeToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingProgramme(null);
    }
  };

  const schools = schoolsData?.data || [];
  const funding = fundingData?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Programmes</h1>
        <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Programme</Button>
          </SheetTrigger>
          <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingProgramme ? 'Edit Programme' : 'Add Programme'}</SheetTitle>
              <SheetDescription>
                {editingProgramme ? 'Update the programme details below.' : 'Fill in the details to add a new programme.'}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField control={form.control} name="schoolId" render={({ field }) => (
                  <FormItem><FormLabel>School *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {schools.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.schoolName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="programmeName" render={({ field }) => (
                  <FormItem><FormLabel>Programme Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="programmeType" render={({ field }) => (
                    <FormItem><FormLabel>Programme Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="FINDING_FUTURES">Finding Futures</SelectItem>
                          <SelectItem value="RISING_FUTURES">Rising Futures</SelectItem>
                          <SelectItem value="LAUNCHING_FUTURES">Launching Futures</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="yearGroup" render={({ field }) => (
                    <FormItem><FormLabel>Year Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Y12">Year 12</SelectItem>
                          <SelectItem value="Y13">Year 13</SelectItem>
                          <SelectItem value="BOTH">Both</SelectItem>
                          <SelectItem value="MIXED">Mixed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="fundingOpportunityId" render={({ field }) => (
                  <FormItem><FormLabel>Funding Opportunity</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select funding (optional)" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {funding.map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>{f.sponsorName} — {f.fundingType}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="startDate" render={({ field }) => (
                    <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="endDate" render={({ field }) => (
                    <FormItem><FormLabel>End Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem><FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="PLANNED">Planned</SelectItem>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="studentCount" render={({ field }) => (
                    <FormItem><FormLabel>Student Count</FormLabel><FormControl><Input {...field} type="number" min="0" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingProgramme(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingProgramme ? 'Update' : 'Create'} Programme
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Programme</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Students</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.map((prog: any) => (
                <tr key={prog.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/programmes/${prog.id}`} className="text-blue-600 hover:underline">
                      {prog.programmeName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prog.programmeType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prog.yearGroup}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={prog.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {prog.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prog.studentCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(prog)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(prog)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.data?.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No programmes found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Programme</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{programmeToDelete?.programmeName}"? This action cannot be undone.
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
