import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { pmApi } from "@/lib/api";
import { Users, Plus } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  setup: "bg-gray-100 text-gray-600",
  active: "bg-blue-100 text-blue-700",
  data_collection: "bg-amber-100 text-amber-700",
  report_generation: "bg-purple-100 text-purple-700",
  complete: "bg-green-100 text-green-700",
};

export function CohortsPage() {
  const { data: cohorts = [], isLoading } = useQuery({
    queryKey: ["lms", "cohorts"],
    queryFn: () => pmApi.getCohorts(),
  });

  if (isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading cohorts...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-deep-navy)]">Cohorts</h1>
        <Link
          href="/cohorts/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-warm-gold)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> New Cohort
        </Link>
      </div>

      {cohorts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cohorts yet</p>
          <Link href="/cohorts/new" className="text-sm text-[var(--color-warm-gold)] mt-2 inline-block">
            Create your first cohort
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cohort</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Programme</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Students</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => { window.location.href = `/cohorts/${c.id}`; }}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.cohortName}</p>
                    {c.leadTeacherName && (
                      <p className="text-xs text-gray-400 mt-0.5">{c.leadTeacherName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">{c.programmeType}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[c.lmsLifecycleStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.lmsLifecycleStatus.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{c.enrolledCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
