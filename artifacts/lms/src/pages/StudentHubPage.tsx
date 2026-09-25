import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { lmsApi } from "@/lib/api";
import {
  ClipboardCheck,
  BarChart3,
  Star,
  FileText,
  MessageSquare,
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowLeft,
} from "lucide-react";

interface Section {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  complete: boolean;
}

export function StudentHubPage() {
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

  const student = studentQuery.data;
  const comp = completenessQuery.data;

  const sections: Section[] = [
    {
      key: "attendance",
      label: "Attendance",
      href: `/my-students/${studentId}/attendance`,
      icon: ClipboardCheck,
      complete: comp?.attendance.meetsThreshold ?? false,
    },
    {
      key: "scores",
      label: "Scores",
      href: `/my-students/${studentId}/scores`,
      icon: BarChart3,
      complete: (comp?.coachScores.pre && comp?.coachScores.end) ?? false,
    },
    {
      key: "talents",
      label: "Chosen Talents",
      href: `/my-students/${studentId}/scores`,
      icon: Star,
      complete: comp?.chosenTalents ?? false,
    },
    {
      key: "survey",
      label: "Student Survey",
      href: `/my-students/${studentId}/survey`,
      icon: MessageSquare,
      complete: comp?.studentSurvey.end ?? false,
    },
    {
      key: "narratives",
      label: "Narratives",
      href: `/my-students/${studentId}/narratives`,
      icon: FileText,
      complete: comp?.narratives.isComplete ?? false,
    },
  ];

  if (studentQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  if (!student) {
    return <p className="text-red-500 py-8 text-center">Student not found</p>;
  }

  const completedCount = sections.filter((s) => s.complete).length;

  return (
    <div>
      <Link href="/my-students" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Back to students
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">
          {student.firstName} {student.lastName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {completedCount} of {sections.length} sections complete
        </p>

        {/* Overall progress bar */}
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 bg-[var(--color-warm-gold)]"
            style={{ width: `${Math.round((completedCount / sections.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Section cards */}
      <div className="grid gap-3">
        {sections.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)]/40 hover:shadow-sm transition-all"
          >
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                section.complete ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400"
              }`}
            >
              <section.icon size={20} />
            </div>

            <div className="flex-1">
              <p className="font-medium text-sm">{section.label}</p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {section.complete ? (
                <CheckCircle2 size={18} className="text-green-500" />
              ) : (
                <Circle size={18} className="text-gray-300" />
              )}
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
