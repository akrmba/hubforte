import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfStudents, createYfStudent, updateYfStudent, deleteYfStudent, getYfSchools, getYfProgrammes } from '../../lib/api';
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
import { Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react';

const studentSchema = z.object({
  schoolId: z.string().min(1, 'School is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  programmeId: z.string().optional(),
  yearGroup: z.string().optional(),
  consentStatus: z.string().optional(),
  safeguardingFlag: z.boolean().optional(),
  supportNotes: z.string().optional(),
  notes: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

const defaultValues: StudentFormValues = {
  schoolId: '',
  firstName: '',
  lastName: '',
  programmeId: '',
  yearGroup: '',
  consentStatus: 'PENDING',
  safeguardingFlag: false,
  supportNotes: '',
  notes: '',
};

export default function StudentsPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['yfStudents'],
    queryFn: () => getYfStudents(),
  });

  const { data: schoolsData } = useQuery({
    queryKey: ['yfSchools'],
    queryFn: () => getYfSchools({}),
  });

  const { data: programmesData } = useQuery({
    queryKey: ['yfProgrammes'],
    queryFn: () => getYfProgrammes(),
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema as any),
    defaultValues: editingStudent ? {
      schoolId: editingStudent.schoolId || '',
      firstName: editingStudent.firstName || '',
      lastName: editingStudent.lastName || '',
      programmeId: editingStudent.programmeId || '',
      yearGroup: editingStudent.yearGroup || '',
      consentStatus: editingStudent.consentStatus || 'PENDING',
      safeguardingFlag: editingStudent.safeguardingFlag || false,
      supportNotes: editingStudent.supportNotes || '',
      notes: editingStudent.notes || '',
    } : defaultValues,
  });

  React.useEffect(() => {
    if (editingStudent) {
      form.reset({
        schoolId: editingStudent.schoolId || '',
        firstName: editingStudent.firstName || '',
        lastName: editingStudent.lastName || '',
        programmeId: editingStudent.programmeId || '',
        yearGroup: editingStudent.yearGroup || '',
        consentStatus: editingStudent.consentStatus || 'PENDING',
        safeguardingFlag: editingStudent.safeguardingFlag || false,
        supportNotes: editingStudent.supportNotes || '',
        notes: editingStudent.notes || '',
      });
    } else {
      form.reset(defaultValues);
    }
  }, [editingStudent, isSheetOpen, form]);

  const createMutation = useMutation({
    mutationFn: createYfStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfStudents'] });
      toast({ title: 'Student created successfully' });
      setIsSheetOpen(false);
      form.reset(defaultValues);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create student', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateYfStudent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfStudents'] });
      toast({ title: 'Student updated successfully' });
      setIsSheetOpen(false);
      setEditingStudent(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update student', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteYfStudent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfStudents'] });
      toast({ title: 'Student deleted' });
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete student', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: StudentFormValues) => {
    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (student: any) => {
    setEditingStudent(student);
    setIsSheetOpen(true);
  };

  const handleDelete = (student: any) => {
    setStudentToDelete(student);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (studentToDelete) {
      deleteMutation.mutate(studentToDelete.id);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setEditingStudent(null);
    }
  };

  const schools = schoolsData?.data || [];
  const programmes = programmesData?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Students</h1>
        <Sheet open={isSheetOpen} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Student</Button>
          </SheetTrigger>
          <SheetContent className="w-[600px] sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingStudent ? 'Edit Student' : 'Add Student'}</SheetTitle>
              <SheetDescription>
                {editingStudent ? 'Update the student details below.' : 'Fill in the details to add a new student.'}
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="programmeId" render={({ field }) => (
                  <FormItem><FormLabel>Programme</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select programme (optional)" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {programmes.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.programmeName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="yearGroup" render={({ field }) => (
                    <FormItem><FormLabel>Year Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Y12">Year 12</SelectItem>
                          <SelectItem value="Y13">Year 13</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="consentStatus" render={({ field }) => (
                    <FormItem><FormLabel>Consent Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="OBTAINED">Obtained</SelectItem>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
                          <SelectItem value="NOT_REQUIRED">Not Required</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="safeguardingFlag" render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl><input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /></FormControl>
                    <FormLabel className="!mt-0">Safeguarding Flag</FormLabel>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supportNotes" render={({ field }) => (
                  <FormItem><FormLabel>Support Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsSheetOpen(false); setEditingStudent(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingStudent ? 'Update' : 'Create'} Student
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Safeguarding</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.map((student: any) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/students/${student.id}`} className="text-blue-600 hover:underline">
                      {student.firstName} {student.lastName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.yearGroup}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={student.consentStatus === 'OBTAINED' ? 'default' : 'secondary'}>
                      {student.consentStatus}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {student.safeguardingFlag && (
                      <ShieldAlert className="h-5 w-5 text-red-500" />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(student)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(student)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.data?.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{studentToDelete?.firstName} {studentToDelete?.lastName}"? This action cannot be undone.
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
