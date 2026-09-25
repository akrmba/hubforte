import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, Users, ClipboardList, Link2, FileText } from "lucide-react";

const PIPELINE_STEPS = [
  { key: "setup", label: "Setup" },
  { key: "active", label: "Active" },
  { key: "data_collection", label: "Data Collection" },
  { key: "report_generation", label: "Report Generation" },
  { key: "complete", label: "Complete" },
];

export function CohortOverviewPage() {
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

  const cohort = cohortQuery.data;
  const comp = completenessQuery.data;

  if (cohortQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  if (!cohort) {
    return <p className="text-red-500 py-8 text-center">Cohort not found</p>;
  }

  const currentStepIdx = PIPELINE_STEPS.findIndex((s) => s.key === cohort.lmsLifecycleStatus);

  return (
    <div>
      <Link
        href="/cohorts"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to cohorts
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-deep-navy)]">{cohort.cohortName}</h1>
          <p className="text-sm text-gray-500 mt-1">{cohort.programmeType}</p>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max">
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < currentStepIdx;
            const active = i === currentStepIdx;
            return (
              <div key={step.key} className="flex items-center">
                <div className={`flex flex-col items-center px-3 ${active ? "opacity-100" : done ? "opacity-70" : "opacity-30"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                    done ? "bg-green-500 text-white" : active ? "bg-[var(--color-warm-gold)] text-white" : "bg-gray-200 text-gray-500"
                  }`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className="text-xs text-gray-600 whitespace-nowrap">{step.label}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-0.5 w-8 ${i < currentStepIdx ? "bg-green-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Students</p>
          <p className="text-2xl font-bold">{cohort.enrolledCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Ready</p>
          <p className="text-2xl font-bold text-green-600">{comp?.readyStudents ?? "—"}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Min Attendance</p>
          <p className="text-2xl font-bold">{cohort.minAttendanceSessions}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Lead Teacher</p>
          <p className="text-sm font-medium truncate">{cohort.leadTeacherName ?? "—"}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href={`/cohorts/${cohortId}/students`}>
          <div className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer text-center">
            <Users size={24} className="mx-auto mb-2 text-[var(--color-warm-gold)]" />
            <p className="text-sm font-medium">Students</p>
          </div>
        </Link>
        <Link href={`/cohorts/${cohortId}/completeness`}>
          <div className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer text-center">
            <ClipboardList size={24} className="mx-auto mb-2 text-[var(--color-warm-gold)]" />
            <p className="text-sm font-medium">Completeness</p>
          </div>
        </Link>
        <Link href={`/cohorts/${cohortId}/survey-links`}>
          <div className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer text-center">
            <Link2 size={24} className="mx-auto mb-2 text-[var(--color-warm-gold)]" />
            <p className="text-sm font-medium">Survey Links</p>
          </div>
        </Link>
        <Link href={`/cohorts/${cohortId}/report-content`}>
          <div className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer text-center">
            <FileText size={24} className="mx-auto mb-2 text-[var(--color-warm-gold)]" />
            <p className="text-sm font-medium">Report Content</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
