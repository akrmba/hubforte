import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYfSchoolsPipeline, updateYfSchool } from '../../lib/api';
import { Card, CardContent } from '@/components/ui/card';

const COLUMNS = ['PROSPECT', 'CONTACTED', 'MEETING_HELD', 'ACTIVE', 'LAPSED'];

export default function SchoolsPipelinePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['yfSchoolsPipeline'],
    queryFn: getYfSchoolsPipeline,
  });

  const updateSchool = useMutation({
    mutationFn: ({ id, relationshipStatus }: { id: string, relationshipStatus: string }) => 
      updateYfSchool(id, { relationshipStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yfSchoolsPipeline'] });
    }
  });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('schoolId', id);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('schoolId');
    if (id) {
      updateSchool.mutate({ id, relationshipStatus: status });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (isLoading) return <div>Loading pipeline...</div>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
      {COLUMNS.map(col => {
        const schools = data?.[col] || [];
        return (
          <div 
            key={col} 
            className="flex-1 min-w-[300px] bg-gray-50 rounded-lg p-4 flex flex-col"
            onDrop={(e) => handleDrop(e, col)}
            onDragOver={handleDragOver}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-sm text-gray-700">{col.replace('_', ' ')}</h3>
              <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                {schools.length}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {schools.map((school: any) => (
                <Card 
                  key={school.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, school.id)}
                  className="cursor-move hover:border-blue-300 transition-colors"
                >
                  <CardContent className="p-4">
                    <div className="font-medium text-sm mb-1">{school.schoolName}</div>
                    <div className="text-xs text-gray-500 mb-2">{school.phase}</div>
                    {school.headteacher && (
                      <div className="text-xs text-gray-600">HT: {school.headteacher}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
