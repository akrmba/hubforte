import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, FileText, Play, Send } from "lucide-react";
import { api } from "@/lib/api";

interface ReportEntry {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  status: "pending" | "generating" | "ready" | "sent" | "error";
  generatedAt: string | null;
  previewUrl: string | null;
}

interface ReportsResponse {
  cohortId: string;
  reports: ReportEntry[];
}

export function ReportsPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;
  const queryClient = useQueryClient();

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const reportsQuery = useQuery({
    queryKey: ["lms", "reports", cohortId],
    queryFn: () => api.get<ReportsResponse>(`/api/lms/cohorts/${cohortId}/reports`),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<{ queued: number }>(`/api/lms/cohorts/${cohortId}/reports/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "reports", cohortId] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (reportId: string) =>
      api.put<{ id: string; status: string; sentAt: string }>(`/api/lms/reports/${reportId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "reports", cohortId] });
    },
  });

  const reports = reportsQuery.data?.reports ?? [];
  const readyCount = reports.filter((r) => r.status === "ready").length;
  const total = reports.length;

  return (
    <div>
      <Link
        href={`/cohorts/${cohortId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to cohort
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          {cohortQuery.data && (
            <p className="text-sm text-gray-500 mt-0.5">{cohortQuery.data.cohortName}</p>
          )}
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-warm-gold)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Play size={14} />
          {generateMutation.isPending ? "Generating..." : "Generate All"}
        </button>
      </div>

      {reportsQuery.isLoading ? (
        <p className="text-gray-500 text-center py-12">Loading reports...</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reports yet</p>
          <p className="text-sm mt-1">Click "Generate All" to create student reports.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Student Reports</h2>
            <span className="text-xs text-gray-500">{readyCount} of {total} ready</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Student</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.status === "ready"
                        ? "bg-green-100 text-green-700"
                        : r.status === "generating"
                        ? "bg-amber-100 text-amber-700"
                        : r.status === "error"
                        ? "bg-red-100 text-red-600"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1.5">
                      {r.status === "ready" && r.previewUrl && (
                        <a
                          href={r.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                          <FileText size={12} /> Preview
                        </a>
                      )}
                      {r.status === "ready" && (
                        <button
                          onClick={() => sendMutation.mutate(r.id)}
                          disabled={sendMutation.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-[var(--color-warm-gold)] text-[var(--color-warm-gold)] rounded hover:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                          <Send size={12} /> Send
                        </button>
                      )}
                      {r.status === "sent" && (
                        <span className="text-xs text-gray-400">Sent</span>
                      )}
                    </div>
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
