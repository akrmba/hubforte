import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileText, Download, Clock, CheckCircle } from "lucide-react";

interface PublicReportData {
  studentId: string;
  firstName: string;
  lastName: string;
  cohortId: string;
  reportAvailable: boolean;
  reportId: string | null;
  reportStatus: string | null;
}

export function StudentReportPortalPage() {
  const reportQuery = useQuery({
    queryKey: ["lms", "public", "report"],
    queryFn: () => api.get<PublicReportData>("/api/lms/public/report"),
    retry: false,
  });

  const data = reportQuery.data;

  if (reportQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3460] to-[#16213e] flex items-center justify-center">
        <p className="text-white/60 text-sm">Loading your report...</p>
      </div>
    );
  }

  if (reportQuery.isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3460] to-[#16213e] flex items-center justify-center px-4">
        <div className="bg-white/10 rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-white font-semibold mb-2">Unable to load report</p>
          <p className="text-white/60 text-sm">Please check your link and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3460] to-[#16213e] flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-white/50 text-xs tracking-widest uppercase mb-3">Yes Futures</p>
          <h1 className="text-white text-2xl font-bold">
            {data.firstName} {data.lastName}
          </h1>
          <p className="text-white/60 text-sm mt-1">Your Personal Impact Report</p>
        </div>

        {/* Report card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          {data.reportAvailable ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Your report is ready</p>
                  <p className="text-xs text-gray-500">Tap below to download your PDF</p>
                </div>
              </div>

              <a
                href="/api/lms/public/report/pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#e8b84b] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                <Download size={18} />
                Download Report PDF
              </a>

              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <FileText size={12} />
                <span>Personal Impact Report · Yes Futures</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Report being prepared</p>
                  <p className="text-xs text-gray-500">Your programme manager is finalising it</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600">
                  Your personal impact report will appear here once it's ready. Check back soon!
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          This page is private to you. Do not share this link.
        </p>
      </div>
    </div>
  );
}
