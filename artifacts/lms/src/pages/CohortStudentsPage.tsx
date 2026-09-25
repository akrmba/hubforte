import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, Plus, Upload } from "lucide-react";

export function CohortStudentsPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const studentsQuery = useQuery({
    queryKey: ["lms", "cohort-students", cohortId],
    queryFn: () => pmApi.getCohortStudents(cohortId),
  });

  const cohort = cohortQuery.data;
  const students = studentsQuery.data ?? [];

  if (studentsQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading students...</p>;
  }

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
          <h1 className="text-xl font-bold">Students</h1>
          {cohort && <p className="text-sm text-gray-500 mt-0.5">{cohort.cohortName}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/cohorts/${cohortId}/students/import`}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload size={15} /> Import CSV
          </Link>
          <Link
            href={`/cohorts/${cohortId}/students/new`}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-warm-gold)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={15} /> Add Student
          </Link>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium">No students yet</p>
          <p className="text-sm mt-1">Import a CSV or add students one by one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Year</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Consent</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => { window.location.href = `/cohorts/${cohortId}/students/${s.id}`; }}
                >
                  <td className="px-4 py-3 font-medium">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">{s.yearGroup ?? "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.completionStatus === "ready" ? "bg-green-100 text-green-700" :
                      s.completionStatus === "withdrawn" ? "bg-red-100 text-red-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {s.completionStatus ?? "incomplete"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.consentStatus === "given" ? "bg-green-100 text-green-700" :
                      s.consentStatus === "refused" ? "bg-red-100 text-red-600" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {s.consentStatus ?? "pending"}
                    </span>
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
