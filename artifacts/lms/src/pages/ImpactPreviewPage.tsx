import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, RefreshCw } from "lucide-react";

// Real backend shape from completeness.ts
interface CompletenessResponse {
  cohortId: string;
  totalStudents: number;
  readyStudents: number;
  incompleteStudents: number;
  excludedStudents: number;
  cohortBlockingItems: {
    leadTeacherNamed: boolean;
    tripData: { itw: boolean; wow: boolean };
    cohortNarratives: { complete: number; total: number; missing: string[] };
  };
}

export function ImpactPreviewPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const completenessQuery = useQuery({
    queryKey: ["lms", "cohort-completeness", cohortId],
    queryFn: () => pmApi.getCohortCompleteness(cohortId),
  });

  const data = completenessQuery.data;
  const cohort = cohortQuery.data;

  const activeStudents = (data?.totalStudents ?? 0) - (data?.excludedStudents ?? 0);
  const readyPct = activeStudents > 0
    ? Math.round(((data?.readyStudents ?? 0) / activeStudents) * 100)
    : 0;

  const blockers = data?.cohortBlockingItems;
  const narrativesComplete = blockers
    ? blockers.cohortNarratives.complete === blockers.cohortNarratives.total
    : false;

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
          <h1 className="text-xl font-bold">Impact Preview</h1>
          {cohort && <p className="text-sm text-gray-500 mt-0.5">{cohort.cohortName}</p>}
        </div>
        <button
          onClick={() => completenessQuery.refetch()}
          disabled={completenessQuery.isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={completenessQuery.isFetching ? "animate-spin" : ""} />
          Recalculate
        </button>
      </div>

      {completenessQuery.isLoading ? (
        <p className="text-gray-500 text-center py-12">Loading impact data...</p>
      ) : (
        <div className="grid gap-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">Active Students</p>
              <p className="text-2xl font-bold">{activeStudents}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">Report Ready</p>
              <p className="text-2xl font-bold text-green-600">{data?.readyStudents ?? 0}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">Completion</p>
              <p className="text-2xl font-bold">{readyPct}%</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Overall readiness</span>
              <span className="text-gray-500">{data?.readyStudents ?? 0} / {activeStudents}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-warm-gold)] rounded-full transition-all"
                style={{ width: `${readyPct}%` }}
              />
            </div>
          </div>

          {/* Cohort blockers */}
          {blockers && (
            <div className="bg-white p-4 rounded-xl border border-gray-200">
              <p className="font-medium text-sm mb-3">Cohort-level checklist</p>
              <div className="grid gap-2">
                {[
                  { done: blockers.leadTeacherNamed, label: "Lead teacher named" },
                  { done: blockers.tripData.itw, label: "Into the Wild trip content complete" },
                  { done: blockers.tripData.wow, label: "World of Work trip content complete" },
                  { done: narrativesComplete, label: "Cohort narratives complete" },
                ].map(({ done, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <span className={done ? "text-green-500" : "text-gray-300"}>
                      {done ? "✓" : "○"}
                    </span>
                    <span className={done ? "text-gray-700" : "text-gray-400"}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link href={`/cohorts/${cohortId}/completeness`}>
            <button className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              View full completeness matrix →
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
