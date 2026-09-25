import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, Check, X, Minus, AlertCircle } from "lucide-react";

type CellStatus = "complete" | "missing" | "na";

function Cell({ status }: { status: CellStatus }) {
  if (status === "complete") return <Check size={14} className="text-green-500 mx-auto" />;
  if (status === "missing") return <X size={14} className="text-red-500 mx-auto" />;
  return <Minus size={14} className="text-gray-300 mx-auto" />;
}

const COLUMNS = [
  { key: "attendance", label: "Attend." },
  { key: "coachScoresPre", label: "C.Pre" },
  { key: "coachScoresEnd", label: "C.End" },
  { key: "studentScoresPre", label: "S.Pre" },
  { key: "studentScoresEnd", label: "S.End" },
  { key: "chosenTalents", label: "Talents" },
  { key: "narratives", label: "Narr." },
  { key: "studentSurveyPre", label: "Sur.Pre" },
  { key: "studentSurveyEnd", label: "Sur.End" },
];

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
  students: Array<{
    studentId: string;
    name: string;
    status: "ready" | "incomplete" | "excluded";
    attendance: { attended: number; total: number; meetsThreshold: boolean };
    coachScores: { pre: boolean; end: boolean };
    studentScores: { pre: boolean; end: boolean };
    teacherScores: { pre: boolean; end: boolean };
    chosenTalents: boolean;
    narratives: { complete: number; total: number; missing: string[] };
    teacherFeedback: { submitted: boolean; blocking: boolean };
    studentSurvey: { pre: boolean; end: boolean };
    parentSurvey: { submitted: boolean; blocking: boolean };
  }>;
}

export function CompletenessDashboardPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const compQuery = useQuery({
    queryKey: ["lms", "cohort-completeness", cohortId],
    queryFn: () => pmApi.getCohortCompleteness(cohortId),
  });

  const cohort = cohortQuery.data;
  const comp = compQuery.data;

  if (compQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading completeness data...</p>;
  }

  const students = comp?.students ?? [];
  const blockers = comp?.cohortBlockingItems;

  return (
    <div>
      <Link
        href={`/cohorts/${cohortId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to cohort
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">Completeness Dashboard</h1>
        {cohort && <p className="text-sm text-gray-500 mt-0.5">{cohort.cohortName}</p>}
      </div>

      {/* Cohort-level blockers */}
      {blockers && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6">
          <h2 className="font-semibold text-sm mb-3">Cohort Blockers</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { ok: blockers.leadTeacherNamed, label: "Lead Teacher Named" },
              { ok: blockers.tripData.itw, label: "ITW Trip Data" },
              { ok: blockers.tripData.wow, label: "WOW Trip Data" },
              { ok: blockers.cohortNarratives.complete === blockers.cohortNarratives.total, label: "Cohort Narratives" },
            ].map(({ ok, label }) => (
              <div key={label} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {ok ? <Check size={14} /> : <AlertCircle size={14} />}
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          <span className="font-bold text-green-600">{comp?.readyStudents ?? 0}</span> of{" "}
          <span className="font-bold">{comp?.totalStudents ?? 0}</span> students ready
        </p>
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 sticky left-0 bg-gray-50 min-w-[140px]">Student</th>
              <th className="px-2 py-3 font-medium text-gray-600 text-center">Status</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-3 font-medium text-gray-600 text-center whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const narrativeDone = s.narratives.complete === s.narratives.total;
              const cells: Record<string, CellStatus> = {
                attendance: s.attendance.meetsThreshold ? "complete" : "missing",
                coachScoresPre: s.coachScores.pre ? "complete" : "missing",
                coachScoresEnd: s.coachScores.end ? "complete" : "missing",
                studentScoresPre: s.studentScores.pre ? "complete" : "missing",
                studentScoresEnd: s.studentScores.end ? "complete" : "missing",
                chosenTalents: s.chosenTalents ? "complete" : "missing",
                narratives: narrativeDone ? "complete" : "missing",
                studentSurveyPre: s.studentSurvey.pre ? "complete" : "missing",
                studentSurveyEnd: s.studentSurvey.end ? "complete" : "missing",
              };

              const isReady = s.status === "ready";

              return (
                <tr key={s.studentId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 sticky left-0 bg-white font-medium">
                    {s.name}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isReady ? "bg-green-100 text-green-700" :
                      s.status === "excluded" ? "bg-gray-100 text-gray-500" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-2 py-2.5 text-center">
                      <Cell status={cells[c.key]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
