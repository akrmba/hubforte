import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getYfSponsor, getYfFunderImpactReport } from '../../lib/api';
import { useParams } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SponsorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const { data: sponsor, isLoading } = useQuery({
    queryKey: ['yfSponsor', id],
    queryFn: () => getYfSponsor(id),
  });

  const { data: report } = useQuery({
    queryKey: ['yfFunderReport', id],
    queryFn: () => getYfFunderImpactReport(id),
    enabled: !!id
  });

  if (isLoading) return <div>Loading...</div>;
  if (!sponsor) return <div>Sponsor not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{sponsor.organisationName}</h1>
          <p className="text-gray-500">Sector: {sponsor.sector} | Region: {sponsor.region}</p>
        </div>
        <Button variant="outline">Edit Sponsor</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funding">Funding</TabsTrigger>
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          <TabsTrigger value="impact">Impact Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-lg mb-4">Details</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Website</dt>
                  <dd className="text-sm font-medium">{sponsor.website}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">CSR Priority</dt>
                  <dd className="text-sm font-medium">{sponsor.csrPriority}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Employee Volunteering Interest</dt>
                  <dd className="text-sm font-medium">{sponsor.employeeVolunteeringInterest ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="funding" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Funding Opportunities</h3>
            <Button size="sm">Add Funding</Button>
          </div>
          <div className="bg-white rounded-md border p-4">
            {sponsor.linkedFundingOpportunities?.map((f: any) => (
              <div key={f.id} className="py-2 border-b last:border-0">
                <div className="font-medium">{f.fundingType} - £{f.amount}</div>
                <div className="text-sm text-gray-500">Stage: {f.stage}</div>
              </div>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="volunteers" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Corporate Volunteers</h3>
          </div>
          <div className="bg-white rounded-md border p-4">
            {sponsor.linkedVolunteers?.map((v: any) => (
              <div key={v.id} className="py-2 border-b last:border-0">
                <div className="font-medium">{v.firstName} {v.lastName}</div>
                <div className="text-sm text-gray-500">{v.email}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="impact" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Impact Report</h3>
            <Button size="sm" onClick={() => window.print()}>Export as PDF</Button>
          </div>
          
          {report && (
            <div className="space-y-6 print:m-4" id="impact-report-content">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Students</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{report.totalStudents}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Schools Reached</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{report.totalSchools}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Volunteer Hours</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{report.totalHoursDelivered}</div></CardContent>
                </Card>
              </div>

              <h4 className="font-semibold mt-6 mb-2">Programmes Supported</h4>
              <div className="bg-white rounded-md border">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Programme</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">School</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Students</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {report.programmes?.map((p: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-sm">{p.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.school}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.studentCount}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.hoursDelivered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
