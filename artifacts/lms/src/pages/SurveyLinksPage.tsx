import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Mail, QrCode } from "lucide-react";
import { useState } from "react";

export function SurveyLinksPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;
  const queryClient = useQueryClient();

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const studentsQuery = useQuery({
    queryKey: ["lms", "cohort-students", cohortId],
    queryFn: () => pmApi.getCohortStudents(cohortId),
  });

  const surveyStatusQuery = useQuery({
    queryKey: ["lms", "cohort-surveys", cohortId],
    queryFn: () => pmApi.getCohortSurveyStatus(cohortId),
  });

  const teacherLinksQuery = useQuery({
    queryKey: ["lms", "teacher-links", cohortId],
    queryFn: () => pmApi.getTeacherLinks(cohortId),
  });

  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherError, setTeacherError] = useState("");

  const createStudentLinkMutation = useMutation({
    mutationFn: ({ studentId, tokenType }: { studentId: string; tokenType: "student_survey" | "parent_survey" }) =>
      pmApi.createStudentSurveyLink(studentId, tokenType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "cohort-surveys", cohortId] });
    },
  });

  const createTeacherLinkMutation = useMutation({
    mutationFn: () => pmApi.createTeacherLinks(cohortId, [{ email: teacherEmail.trim() }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "teacher-links", cohortId] });
      setTeacherEmail("");
      setTeacherError("");
    },
    onError: (err: Error) => setTeacherError(err.message),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => pmApi.revokeToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "teacher-links", cohortId] });
    },
  });

  const students = studentsQuery.data ?? [];
  const surveyStatusStudents = surveyStatusQuery.data?.students ?? [];
  const teacherLinks = teacherLinksQuery.data ?? [];

  const statusMap = Object.fromEntries(surveyStatusStudents.map((s) => [s.studentId, s]));

  if (studentsQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  return (
    <div>
      <Link
        href={`/cohorts/${cohortId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to cohort
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">Survey Links</h1>
        {cohortQuery.data && <p className="text-sm text-gray-500 mt-0.5">{cohortQuery.data.cohortName}</p>}
      </div>

      {/* Student survey links */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-sm">Student Surveys</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Student</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">Pre</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">End</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const st = statusMap[s.id];
              return (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium">{s.firstName} {s.lastName}</td>
                  <td className="px-3 py-2.5 text-center">
                    {st?.studentSurvey?.pre ? (
                      <span className="text-xs text-green-600 font-medium">✓ Done</span>
                    ) : (
                      <span className="text-xs text-gray-400">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {st?.studentSurvey?.end ? (
                      <span className="text-xs text-green-600 font-medium">✓ Done</span>
                    ) : (
                      <span className="text-xs text-gray-400">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => createStudentLinkMutation.mutate({ studentId: s.id, tokenType: "student_survey" })}
                      disabled={createStudentLinkMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      <QrCode size={12} /> Generate
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Teacher links */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Teacher Links</h2>
        </div>

        {/* Add teacher email */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex gap-2">
            <input
              type="email"
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
              placeholder="teacher@school.org"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={() => {
                if (!teacherEmail.trim()) { setTeacherError("Enter an email address."); return; }
                createTeacherLinkMutation.mutate();
              }}
              disabled={createTeacherLinkMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-warm-gold)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={15} /> Send Link
            </button>
          </div>
          {teacherError && <p className="text-red-500 text-xs mt-1">{teacherError}</p>}
        </div>

        {teacherLinks.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No teacher links yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Email</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 hidden md:table-cell">Uses</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 hidden md:table-cell">Expires</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teacherLinks.map((tl) => (
                <tr key={tl.id} className={`border-b border-gray-50 ${tl.revokedAt ? "opacity-40" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="text-gray-600 text-xs">{tl.tokenType}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell text-gray-500">{tl.useCount}</td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell text-gray-500">
                    {tl.expiresAt ? new Date(tl.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!tl.revokedAt && (
                      <button
                        onClick={() => revokeTokenMutation.mutate(tl.id)}
                        disabled={revokeTokenMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    )}
                    {tl.revokedAt && <span className="text-xs text-gray-400">Revoked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
