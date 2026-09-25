import { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { logUserAction } from "../lib/analytics";
import { FileQuestion } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  useEffect(() => {
    logUserAction('page_view', { page: 'NotFound' });
  }, []);

  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
        <p className="text-gray-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button
          onClick={() => setLocation("/dashboard")}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
