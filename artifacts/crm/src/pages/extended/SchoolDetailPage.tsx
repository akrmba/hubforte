import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getYfSchool } from '../../lib/api';
import { useParams } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export default function SchoolDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const { data: school, isLoading } = useQuery({
    queryKey: ['yfSchool', id],
    queryFn: () => getYfSchool(id),
  });

  if (isLoading) return <div>Loading...</div>;
  if (!school) return <div>School not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{school.schoolName}</h1>
          <p className="text-gray-500">URN: {school.urn} | Phase: {school.phase}</p>
        </div>
        <Button variant="outline">Edit School</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="programmes">Programmes</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-lg mb-4">Details</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Address</dt>
                  <dd className="text-sm font-medium">{school.address}, {school.postcode}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Website</dt>
                  <dd className="text-sm font-medium">{school.website}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium">{school.phone}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Trust</dt>
                  <dd className="text-sm font-medium">{school.linkedTrust?.trustName || 'None'}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-4">Key Staff</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Headteacher</dt>
                  <dd className="text-sm font-medium">{school.headteacher}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">DSL</dt>
                  <dd className="text-sm font-medium">{school.dsl}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">SENCO</dt>
                  <dd className="text-sm font-medium">{school.senco}</dd>
                </div>
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Linked Contacts</h3>
            <Button size="sm">Add Contact</Button>
          </div>
          <div className="bg-white rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {school.linkedContacts?.map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-6 py-4 text-sm font-medium">{c.firstName} {c.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{c.jobTitle}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="programmes" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Programmes</h3>
            <Button size="sm">Add Programme</Button>
          </div>
          <div className="bg-white rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {school.linkedProgrammes?.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 text-sm font-medium">{p.programmeName}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.programmeType}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="activities" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Activity Log</h3>
            <Button size="sm">Log Activity</Button>
          </div>
          <div className="space-y-4">
            {school.linkedActivities?.map((a: any) => (
              <div key={a.id} className="p-4 bg-white rounded-md border">
                <div className="flex justify-between">
                  <h4 className="font-medium text-sm">{a.subject}</h4>
                  <span className="text-xs text-gray-500">{new Date(a.date).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{a.notes}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
