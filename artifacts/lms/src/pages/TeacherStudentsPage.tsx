import { useEffect, useState } from "react";
import { Link } from "wouter";
import { teacherApi } from "@/lib/api";
import type { TeacherStudent } from "@/lib/api";
import { CheckCircle2, Circle } from "lucide-react";

export function TeacherStudentsPage() {
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    teacherApi.getStudents()
      .then((d) => { setStudents(d.students); setStatus("ready"); })
      .catch((err) => { setStatus("error"); setErrorMsg(err.message || "Session expired."); });
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="w-10 h-10 border-4 border-[var(--color-warm-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-xl font-bold mb-2">Session Problem</h1>
          <p className="text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const complete = students.filter((s) => s.feedbackSubmitted).length;

  return (
    <div className="min-h-screen bg-[var(--color-cream)] p-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[var(--color-deep-navy)]">Your Students</h1>
          <span className="text-sm text-gray-500">{complete} of {students.length} complete</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[var(--color-warm-gold)] rounded-full transition-all"
            style={{ width: `${students.length > 0 ? (complete / students.length) * 100 : 0}%` }}
          />
        </div>

        <div className="grid gap-3">
          {students.map((s) => (
            <Link key={s.id} href={`/teacher/students/${s.id}`}>
              <div className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[var(--color-warm-gold)] transition-colors cursor-pointer flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.firstName} {s.lastName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.feedbackSubmitted ? "Complete" : "Pending"}</p>
                </div>
                {s.feedbackSubmitted ? (
                  <CheckCircle2 size={22} className="text-green-500 shrink-0" />
                ) : (
                  <Circle size={22} className="text-gray-300 shrink-0" />
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
