import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, User } from "lucide-react";

export function StudentDetailPage() {
  const params = useParams<{ cohortId: string; studentId: string }>();
  const cohortId = params.cohortId!;
  const studentId = params.studentId!;

  const studentQuery = useQuery({
    queryKey: ["lms", "student", studentId],
    queryFn: () => pmApi.getCohortStudents(cohortId).then((students) =>
      students.find((s) => s.id === studentId) ?? null
    ),
  });

  const completenessQuery = useQuery({
    queryKey: ["lms", "student-completeness", studentId],
    queryFn: () => import("@/lib/api").then(({ api }) =>
      api.get<{ status: string }>(`/api/lms/students/students/${studentId}/completeness`)
    ),
  });

  const student = studentQuery.data;

  if (studentQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  if (!student) {
    return (
      <div className="text-center py-16 text-gray-400">
        <User size={48} className="mx-auto mb-3 opacity-30" />
        <p>Student not found.</p>
        <Link href={`/cohorts/${cohortId}/students`} className="text-sm text-[var(--color-warm-gold)] mt-2 inline-block">
          Back to students
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/cohorts/${cohortId}/students`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={16} /> Back to students
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full bg-[var(--color-warm-gold)] flex items-center justify-center text-white font-bold text-lg">
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold">{student.firstName} {student.lastName}</h1>
          {student.yearGroup && <p className="text-sm text-gray-500">{student.yearGroup}</p>}
        </div>
        <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium ${
          student.completionStatus === "WITHDRAWN"
            ? "bg-red-100 text-red-600"
            : "bg-green-100 text-green-700"
        }`}>
          {student.completionStatus ?? "ENROLLED"}
        </span>
      </div>

      <div className="grid gap-4">
        {/* Details card */}
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h2 className="font-semibold text-sm mb-3">Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              { label: "Gender", value: student.gender },
              { label: "Year Group", value: student.yearGroup },
              { label: "Pupil Premium", value: student.pupilPremiumFlag ? "Yes" : "No" },
              { label: "EAL", value: student.ealFlag ? "Yes" : "No" },
              { label: "SEN Stage", value: student.senStage },
              { label: "Looked After", value: student.lookedAfterFlag ? "Yes" : "No" },
              { label: "Care Experienced", value: student.careExperiencedFlag ? "Yes" : "No" },
              { label: "Consent", value: student.consentStatus },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-gray-500 text-xs">{label}</dt>
                <dd className="font-medium">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Access code */}
        {student.personalAccessCode && (
          <div className="bg-white p-5 rounded-xl border border-gray-200">
            <h2 className="font-semibold text-sm mb-2">Personal Access Code</h2>
            <p className="font-mono text-2xl tracking-widest text-[var(--color-deep-navy)]">
              {student.personalAccessCode}
            </p>
            <p className="text-xs text-gray-400 mt-1">Share this code with the student to access their survey.</p>
          </div>
        )}

        {/* Completeness status */}
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <h2 className="font-semibold text-sm mb-2">Report Status</h2>
          {completenessQuery.isLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : (
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              completenessQuery.data?.status === "ready"
                ? "bg-green-100 text-green-700"
                : completenessQuery.data?.status === "excluded"
                ? "bg-gray-100 text-gray-500"
                : "bg-amber-100 text-amber-700"
            }`}>
              {completenessQuery.data?.status ?? "incomplete"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
