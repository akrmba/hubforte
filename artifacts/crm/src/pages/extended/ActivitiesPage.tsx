import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getYfActivities } from '../../lib/api';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function ActivitiesPage() {
  const [showOverdue, setShowOverdue] = useState(false);
  
  const { data, isLoading } = useQuery({
    queryKey: ['yfActivities'],
    queryFn: () => getYfActivities(),
  });

  const getLinkForRecord = (activity: any) => {
    switch(activity.linkedRecordType) {
      case 'SCHOOL': return `/ext/schools/${activity.linkedSchoolId}`;
      case 'TRUST': return `/ext/trusts/${activity.linkedTrustId}`;
      case 'SPONSOR': return `/ext/sponsors/${activity.linkedSponsorId}`;
      case 'PROGRAMME': return `/ext/programmes/${activity.linkedProgrammeId}`;
      case 'VOLUNTEER': return `/ext/volunteers/${activity.linkedVolunteerId}`;
      case 'STUDENT': return `/ext/students/${activity.linkedStudentId}`;
      default: return '#';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Activities</h1>
        <Button>Log Activity</Button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm font-medium">
          <input 
            type="checkbox" 
            className="mr-2"
            checked={showOverdue} 
            onChange={(e) => setShowOverdue(e.target.checked)} 
          />
          Show Overdue Only
        </label>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white rounded-md border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Linked Record</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.data?.filter((a: any) => {
                if (!showOverdue) return true;
                if (!a.nextActionDate) return false;
                return new Date(a.nextActionDate) <= new Date();
              }).map((activity: any) => (
                <tr key={activity.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(activity.date), 'dd MMM yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline">{activity.activityType}</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{activity.subject}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link href={getLinkForRecord(activity)} className="text-blue-600 hover:underline">
                      {activity.linkedRecordType}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {activity.nextAction && (
                      <div>
                        {activity.nextAction} 
                        <span className={`ml-2 text-xs font-medium ${new Date(activity.nextActionDate) <= new Date() ? 'text-red-600' : 'text-gray-400'}`}>
                          ({format(new Date(activity.nextActionDate), 'dd MMM yyyy')})
                        </span>
                      </div>
                    )}
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
