import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { lmsApi } from "@/lib/api";
import { ArrowLeft, Smartphone, CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";

export function SurveyHandoverPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId!;

  const studentQuery = useQuery({
    queryKey: ["lms", "student", studentId],
    queryFn: () => lmsApi.getStudent(studentId),
  });

  const completenessQuery = useQuery({
    queryKey: ["lms", "student-completeness", studentId],
    queryFn: () => lmsApi.getStudentCompleteness(studentId),
  });

  const [handoverUrl, setHandoverUrl] = useState<string | null>(null);

  const handoverMutation = useMutation({
    mutationFn: () => lmsApi.createHandoverSession(studentId),
    onSuccess: (data) => {
      const baseUrl = window.location.origin;
      setHandoverUrl(`${baseUrl}/enter#token=${data.inviteToken}`);
    },
  });

  const student = studentQuery.data;
  const comp = completenessQuery.data;
  const surveyPre = comp?.studentSurvey?.pre ?? false;
  const surveyEnd = comp?.studentSurvey?.end ?? false;

  if (studentQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  if (!student) {
    return <p className="text-red-500 py-8 text-center">Student not found</p>;
  }

  return (
    <div>
      <Link
        href={`/my-students/${studentId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to student hub
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">
          Student Survey — {student.firstName} {student.lastName}
        </h1>
      </div>

      {/* Survey status */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-4">
        <h2 className="font-semibold text-sm mb-3">Survey Status</h2>
        <div className="grid gap-2">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">Pre-programme survey</span>
            {surveyPre ? (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle2 size={16} /> Submitted
              </span>
            ) : (
              <span className="text-gray-400 text-sm">Not submitted</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">End-programme survey</span>
            {surveyEnd ? (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle2 size={16} /> Submitted
              </span>
            ) : (
              <span className="text-gray-400 text-sm">Not submitted</span>
            )}
          </div>
        </div>
      </div>

      {/* Handover button */}
      {!handoverUrl ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
          <Smartphone size={48} className="mx-auto text-[var(--color-warm-gold)] mb-4" />
          <h2 className="font-semibold text-lg mb-2">Hand Device to Student</h2>
          <p className="text-sm text-gray-500 mb-4">
            This will generate a short-lived survey link. Hand your device to the student
            so they can complete their survey. The link expires in 15 minutes.
          </p>
          <button
            onClick={() => handoverMutation.mutate()}
            disabled={handoverMutation.isPending}
            className="px-6 py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {handoverMutation.isPending ? "Generating..." : "Generate Survey Link"}
          </button>
          {handoverMutation.isError && (
            <p className="text-red-500 text-sm mt-2">
              Failed to generate link. Please try again.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-green-200 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="font-semibold text-lg mb-2">Survey Link Ready</h2>
          <p className="text-sm text-gray-500 mb-4">
            Hand your device to the student. They can complete the survey at the link below.
          </p>
          <a
            href={handoverUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--color-deep-navy)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <ExternalLink size={18} />
            Open Survey
          </a>
          <button
            onClick={() => setHandoverUrl(null)}
            className="block mx-auto mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Generate new link
          </button>
        </div>
      )}
    </div>
  );
}
