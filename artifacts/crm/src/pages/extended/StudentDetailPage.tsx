import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getYfStudent } from '../../lib/api';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function StudentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user, isSuperAdmin, isAdmin, isManager } = useAuth();
  
  const canSeeNotes = isSuperAdmin || isAdmin || isManager;
  
  const { data: student, isLoading } = useQuery({
    queryKey: ['yfStudent', id],
    queryFn: () => getYfStudent(id),
  });

  if (isLoading) return <div>Loading...</div>;
  if (!student) return <div>Student not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{student.firstName} {student.lastName}</h1>
          {student.safeguardingFlag && <ShieldAlert className="h-6 w-6 text-red-500" />}
        </div>
        <Button variant="outline">Edit Student</Button>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h3 className="font-semibold text-lg mb-4">Details</h3>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-gray-500">Year Group</dt>
              <dd className="text-sm font-medium">{student.yearGroup}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Consent Status</dt>
              <dd className="text-sm font-medium">{student.consentStatus}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Attendance Count</dt>
              <dd className="text-sm font-medium">{student.attendanceCount}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-4 text-red-700 flex items-center gap-2">
            Safeguarding & Support
            {!canSeeNotes && <Lock className="h-4 w-4" />}
          </h3>
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            {canSeeNotes ? (
              <div>
                <dt className="text-sm text-red-700 font-medium">Support Notes</dt>
                <dd className="text-sm text-red-900 mt-1 whitespace-pre-wrap">{student.supportNotes || 'No notes'}</dd>
              </div>
            ) : (
              <div className="text-sm text-red-700">
                You do not have permission to view safeguarding and support notes for this student.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
