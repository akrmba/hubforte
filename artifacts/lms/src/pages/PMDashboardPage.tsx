import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { pmApi } from "@/lib/api";
import { Users, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  setup: "bg-gray-100 text-gray-600",
  active: "bg-blue-100 text-blue-700",
  data_collection: "bg-amber-100 text-amber-700",
  report_generation: "bg-purple-100 text-purple-700",
  complete: "bg-green-100 text-green-700",
};

export function PMDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["lms", "dashboard"],
    queryFn: () => pmApi.getDashboard(),
  });

  if (isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading dashboard...</p>;
  }

  const cohorts = data?.cohorts ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-deep-navy)]">Dashboard</h1>
        <Link
          href="/cohorts/new"
          className="px-4 py-2 bg-[var(--color-warm-gold)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Cohort
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Total Cohorts</p>
          <p className="text-2xl font-bold">{data?.totalCohorts ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Active Students</p>
          <p className="text-2xl font-bold">
            {cohorts.reduce((sum, c) => sum + c.activeStudents, 0)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Total Students</p>
          <p className="text-2xl font-bold">
            {cohorts.reduce((sum, c) => sum + c.totalStudents, 0)}
          </p>
        </div>
      </div>

      {/* Cohort cards */}
      {cohorts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cohorts yet</p>
          <p className="text-sm mt-1">Create your first cohort to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cohorts.map((c) => (
            <Link key={c.id} href={`/cohorts/${c.id}`}>
              <div className="bg-white p-5 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">{c.cohortName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.programmeType}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[c.lmsLifecycleStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {c.lmsLifecycleStatus.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{c.activeStudents} active</span>
                  {c.withdrawnStudents > 0 && <span>{c.withdrawnStudents} withdrawn</span>}
                </div>

                {c.leadTeacherName && (
                  <p className="text-xs text-gray-400 mt-2">{c.leadTeacherName}</p>
                )}

                {c.lmsLifecycleStatus !== "complete" && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                    <Clock size={12} />
                    <span>In progress</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
