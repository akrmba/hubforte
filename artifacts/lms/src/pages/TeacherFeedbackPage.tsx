import { useState, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { teacherApi } from "@/lib/api";
import type { TeacherFeedbackEntry } from "@/lib/api";
import { ArrowLeft, Save, Check } from "lucide-react";

const BOOLEAN_FIELDS: Array<{ key: keyof TeacherFeedbackEntry; label: string }> = [
  { key: "aspirationChange", label: "Aspiration has changed" },
  { key: "attendanceChange", label: "Attendance has changed" },
  { key: "behaviourChange", label: "Behaviour has changed" },
  { key: "academicProgressChange", label: "Academic progress has changed" },
];

export function TeacherFeedbackPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId!;

  const [local, setLocal] = useState<Partial<TeacherFeedbackEntry>>({ studentId });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(
    (fields: Partial<TeacherFeedbackEntry>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await teacherApi.submitFeedback({ studentId, ...fields } as TeacherFeedbackEntry);
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      }, 600);
    },
    [studentId],
  );

  function update(key: keyof TeacherFeedbackEntry, value: boolean | string | null) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    debouncedSave(updated);
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)] p-6">
      <div className="max-w-lg mx-auto">
        <Link
          href="/teacher/students"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={16} /> Back to students
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[var(--color-deep-navy)]">Student Feedback</h1>
          <div className="flex items-center gap-1.5 text-xs min-h-[20px]">
            {saveStatus === "saving" && <><Save size={12} className="animate-pulse text-amber-500" /><span className="text-amber-600">Saving...</span></>}
            {saveStatus === "saved" && <><Check size={12} className="text-green-500" /><span className="text-green-600">Saved</span></>}
            {saveStatus === "error" && <span className="text-red-500">Save failed</span>}
          </div>
        </div>

        <div className="grid gap-4">
          {/* Boolean change indicators */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <p className="font-medium text-sm mb-3">Changes observed since programme start</p>
            <div className="grid gap-3">
              {BOOLEAN_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <div className="flex gap-2">
                    {([true, false, null] as const).map((val) => (
                      <button
                        key={String(val)}
                        onClick={() => update(key, val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          local[key] === val
                            ? val === true
                              ? "bg-green-500 text-white"
                              : val === false
                              ? "bg-red-400 text-white"
                              : "bg-gray-400 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {val === true ? "Yes" : val === false ? "No" : "N/A"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Free text reflection */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <label className="block font-medium text-sm mb-2">Reflection (optional)</label>
            <textarea
              value={(local.freeTextReflection as string) ?? ""}
              onChange={(e) => update("freeTextReflection", e.target.value || null)}
              rows={5}
              placeholder="Any additional observations about this student's progress..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y"
            />
          </div>

          <Link href="/teacher/students">
            <button className="w-full py-3 bg-[var(--color-deep-navy)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
              Save &amp; Back to Students
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
