import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { lmsApi } from "@/lib/api";
import type { Student, CompletenessStudent } from "@/lib/api";
import { Link } from "wouter";
import { ChevronRight, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export function MyStudentsPage() {
  const { user } = useAuth();

  // Coach-scoped endpoint — returns all assigned students across cohorts
  const studentsQuery = useQuery({
    queryKey: ["lms", "my-students"],
    queryFn: () => lmsApi.getMyStudents(),
    enabled: !!user,
  });

  // Load completeness for each student
  const completenessQueries = useQuery({
    queryKey: ["lms", "completeness-all"],
    queryFn: async () => {
      if (!studentsQuery.data) return [];
      const results = await Promise.all(
        studentsQuery.data.map((s) =>
          lmsApi.getStudentCompleteness(s.id).catch(() => null),
        ),
      );
      return results;
    },
    enabled: !!studentsQuery.data && studentsQuery.data.length > 0,
  });

  const students = studentsQuery.data ?? [];
  const completeness = completenessQueries.data ?? [];

  function getCompleteness(studentId: string): CompletenessStudent | null {
    return completeness.find((c) => c?.studentId === studentId) ?? null;
  }

  function getProgressPercent(c: CompletenessStudent | null): number {
    if (!c) return 0;
    let done = 0;
    let total = 6;
    if (c.attendance.meetsThreshold) done++;
    if (c.coachScores.pre) done++;
    if (c.coachScores.end) done++;
    if (c.chosenTalents) done++;
    if (c.narratives.isComplete) done++;
    if (c.studentSurvey.end) done++;
    return Math.round((done / total) * 100);
  }

  function getNextAction(c: CompletenessStudent | null): string {
    if (!c) return "Loading...";
    if (!c.coachScores.pre) return "Enter pre scores";
    if (!c.coachScores.end) return "Enter end scores";
    if (!c.chosenTalents) return "Select chosen talents";
    if (!c.narratives.isComplete) return "Complete narratives";
    if (!c.studentSurvey.end) return "Student end survey needed";
    return "All complete";
  }

  if (studentsQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading students...</p>;
  }

  if (students.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 text-lg">No students assigned to you yet.</p>
        <p className="text-gray-400 text-sm mt-1">Your Programme Manager will assign students to your cohort.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">My Students</h1>

      <div className="grid gap-3">
        {students.map((student) => {
          const comp = getCompleteness(student.id);
          const progress = getProgressPercent(comp);
          const nextAction = getNextAction(comp);
          const isComplete = progress === 100;

          return (
            <Link
              key={student.id}
              href={`/my-students/${student.id}`}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)]/40 hover:shadow-sm transition-all"
            >
              {/* Status icon */}
              <div className="flex-shrink-0">
                {isComplete ? (
                  <CheckCircle2 size={28} className="text-green-500" />
                ) : progress > 50 ? (
                  <Clock size={28} className="text-amber-500" />
                ) : (
                  <AlertCircle size={28} className="text-gray-400" />
                )}
              </div>

              {/* Student info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{nextAction}</p>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: isComplete
                        ? "var(--color-soft-green)"
                        : "var(--color-warm-gold)",
                    }}
                  />
                </div>
              </div>

              {/* Progress % + chevron */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-medium text-gray-500">{progress}%</span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
