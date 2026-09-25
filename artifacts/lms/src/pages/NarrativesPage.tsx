import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { lmsApi } from "@/lib/api";
import type { Narrative } from "@/lib/api";
import { ArrowLeft, Save, Check, WifiOff, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";

const NARRATIVE_FIELDS = [
  { key: "overallEngagement", label: "Overall Engagement", type: "select" as const },
  { key: "attendanceComment", label: "Attendance Comment", type: "textarea" as const },
  { key: "itwReflection", label: "Into the Wild Reflection", type: "textarea" as const },
  { key: "wowReflection", label: "World of Work Reflection", type: "textarea" as const },
  { key: "talentProgressSummary", label: "Talent Progress Summary", type: "textarea" as const },
  { key: "overallProgressSummary", label: "Overall Progress Summary", type: "textarea" as const },
  { key: "nextSteps", label: "Next Steps", type: "textarea" as const },
] as const;

type FieldKey = (typeof NARRATIVE_FIELDS)[number]["key"];

const ENGAGEMENT_OPTIONS = [
  { value: "exceptional", label: "Exceptional" },
  { value: "strong", label: "Strong" },
  { value: "good", label: "Good" },
  { value: "developing", label: "Developing" },
  { value: "limited", label: "Limited" },
];

export function NarrativesPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId!;
  const queryClient = useQueryClient();
  const { isOnline, pendingCount, syncStatus, mutate } = useOfflineMutation();

  const studentQuery = useQuery({
    queryKey: ["lms", "student", studentId],
    queryFn: () => lmsApi.getStudent(studentId),
  });

  const narrativesQuery = useQuery({
    queryKey: ["lms", "narratives", studentId],
    queryFn: () => lmsApi.getNarratives(studentId),
  });

  const [localFields, setLocalFields] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const student = studentQuery.data;
  const narratives = narrativesQuery.data;

  useEffect(() => {
    if (narratives) {
      const fields: Record<string, string> = {};
      for (const f of NARRATIVE_FIELDS) {
        const value = narratives[f.key as keyof Narrative];
        fields[f.key] = (typeof value === "string" ? value : "") ?? "";
      }
      setLocalFields(fields);
    }
  }, [narratives]);

  useEffect(() => {
    if (syncStatus === "synced") {
      queryClient.invalidateQueries({ queryKey: ["lms", "narratives", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
    }
  }, [syncStatus, studentId, queryClient]);

  const debouncedSave = useCallback(
    (fields: Record<string, string>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        const ok = await mutate("PUT", `/api/lms/students/${studentId}/narratives`, fields);
        if (ok) {
          queryClient.invalidateQueries({ queryKey: ["lms", "narratives", studentId] });
          queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus(isOnline ? "idle" : "saved");
          if (!isOnline) setTimeout(() => setSaveStatus("idle"), 2000);
        }
      }, 800);
    },
    [mutate, studentId, isOnline, queryClient],
  );

  function updateField(key: string, value: string) {
    const newFields = { ...localFields, [key]: value };
    setLocalFields(newFields);
    debouncedSave(newFields);
  }

  const completedCount = NARRATIVE_FIELDS.filter((f) => !!localFields[f.key]).length;
  const requiredCount = NARRATIVE_FIELDS.length;

  if (studentQuery.isLoading || narrativesQuery.isLoading) {
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
          Narratives — {student.firstName} {student.lastName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {completedCount} of {requiredCount} fields complete
        </p>
      </div>

      {/* Sync / save status */}
      <div className="mb-4 flex items-center gap-2 text-sm min-h-[24px]">
        {!isOnline && (
          <>
            <WifiOff size={14} className="text-amber-500" />
            <span className="text-amber-600">
              Offline{pendingCount > 0 ? ` — ${pendingCount} queued` : ""}
            </span>
          </>
        )}
        {isOnline && syncStatus === "syncing" && (
          <>
            <RefreshCw size={14} className="animate-spin text-blue-500" />
            <span className="text-blue-600">Syncing...</span>
          </>
        )}
        {isOnline && syncStatus === "synced" && (
          <>
            <Check size={14} className="text-green-500" />
            <span className="text-green-600">Synced</span>
          </>
        )}
        {isOnline && syncStatus === "idle" && saveStatus === "saving" && (
          <>
            <Save size={14} className="animate-pulse text-amber-500" />
            <span className="text-amber-600">Saving...</span>
          </>
        )}
        {isOnline && syncStatus === "idle" && saveStatus === "saved" && (
          <>
            <Check size={14} className="text-green-500" />
            <span className="text-green-600">Saved</span>
          </>
        )}
      </div>

      <div className="grid gap-4">
        {NARRATIVE_FIELDS.map((field) => {
          const value = localFields[field.key] ?? "";
          const isComplete = !!value;

          return (
            <div key={field.key} className="bg-white p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-sm">{field.label}</label>
                {isComplete && <Check size={16} className="text-green-500" />}
              </div>

              {field.type === "select" ? (
                <select
                  value={value}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Select engagement level...</option>
                  {ENGAGEMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  value={value}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  rows={4}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y min-h-[100px]"
                />
              )}

              {field.type === "textarea" && (
                <p className="text-xs text-gray-400 mt-1 text-right">{value.length} characters</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
