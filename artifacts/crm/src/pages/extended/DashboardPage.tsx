import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getYfDashboard } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Building2, BookOpen, Heart, Clock, PoundSterling, School, Users, Mail, GraduationCap, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['yfDashboard'],
    queryFn: getYfDashboard,
  });
  const { isModuleEnabled } = useFeatureFlags();

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data available</div>;

  const showWelcome = data.activeSchools === 0 && data.activeProgrammes === 0;
  const lmsUrl = import.meta.env.VITE_LMS_URL;
  const lmsWidget = isModuleEnabled("lms") ? (
    <Card className="border-teal-200 bg-teal-50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-teal-900">Learning Management System</CardTitle>
        <GraduationCap className="h-5 w-5 text-teal-600" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-teal-700 mb-3">Manage programmes, cohorts, student reports and more</p>
        {lmsUrl ? (
          <a
            href={lmsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            Open LMS <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-sm text-teal-500">LMS not configured. Contact your administrator.</span>
        )}
      </CardContent>
    </Card>
  ) : null;

  if (showWelcome) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Extended Dashboard</h1>
        <p className="text-gray-500">Welcome! Get started by setting up your first records.</p>

        <div className="flex flex-row gap-6">
          <Link href="/ext/schools" className="flex-1">
            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <School className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-base">Add your first school</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Register a school to start tracking programmes, students, and volunteer placements.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/ext/contacts" className="flex-1">
            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-base">Add your first contact</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Create a contact for a teacher, funder, or volunteer you work with.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/outreach" className="flex-1">
            <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Mail className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle className="text-base">Send an email</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Reach out to a contact or launch your first email campaign.</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {lmsWidget}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Extended Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeSchools}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Programmes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeProgrammes}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Volunteers</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeVolunteers}</div>
          </CardContent>
        </Card>

        <Card className={data.dbsExpiringIn60Days > 0 ? "border-amber-500 bg-amber-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">DBS Expiring</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${data.dbsExpiringIn60Days > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.dbsExpiringIn60Days > 0 ? "text-amber-700" : ""}`}>{data.dbsExpiringIn60Days}</div>
          </CardContent>
        </Card>

        <Card className={data.fundingRenewingIn90Days > 0 ? "border-amber-500 bg-amber-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Funding Renewals (90d)</CardTitle>
            <PoundSterling className={`h-4 w-4 ${data.fundingRenewingIn90Days > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.fundingRenewingIn90Days > 0 ? "text-amber-700" : ""}`}>{data.fundingRenewingIn90Days}</div>
          </CardContent>
        </Card>

        <Card className={data.overdueActions?.length > 0 ? "border-red-500 bg-red-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Actions</CardTitle>
            <Clock className={`h-4 w-4 ${data.overdueActions?.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.overdueActions?.length > 0 ? "text-red-700" : ""}`}>{data.overdueActions?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {lmsWidget}

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Overdue Actions</h2>
        {data.overdueActions && data.overdueActions.length > 0 ? (
          <div className="bg-white rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Link</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.overdueActions.map((action: any) => {
                  let linkPath = "";
                  switch(action.linkedRecordType) {
                    case 'SCHOOL': linkPath = `/ext/schools/${action.linkedSchoolId}`; break;
                    case 'TRUST': linkPath = `/ext/trusts/${action.linkedTrustId}`; break;
                    case 'SPONSOR': linkPath = `/ext/sponsors/${action.linkedSponsorId}`; break;
                    case 'PROGRAMME': linkPath = `/ext/programmes/${action.linkedProgrammeId}`; break;
                    case 'VOLUNTEER': linkPath = `/ext/volunteers/${action.linkedVolunteerId}`; break;
                    case 'STUDENT': linkPath = `/ext/students/${action.linkedStudentId}`; break;
                  }

                  return (
                    <tr key={action.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{action.activityType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{action.subject}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{action.nextAction}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                        {action.nextActionDate ? format(new Date(action.nextActionDate), 'dd MMM yyyy') : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {linkPath && <Link href={linkPath} className="text-blue-600 hover:text-blue-900">View Record</Link>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 text-gray-500 rounded-md border text-center">
            No overdue actions. Great job!
          </div>
        )}
      </div>
    </div>
  );
}
