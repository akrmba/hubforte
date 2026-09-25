import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { lmsApi } from "@/lib/api";
import type { ScoreEntry } from "@/lib/api";
import { ArrowLeft, Save, Check, WifiOff, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";

const TALENTS = [
  { key: "confidence", label: "Confidence" },
  { key: "resilience", label: "Resilience" },
  { key: "communication", label: "Communication" },
  { key: "selfAwareness", label: "Self-Awareness" },
] as const;

type TalentKey = (typeof TALENTS)[number]["key"];

export function ScoresPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId!;
  const queryClient = useQueryClient();
  const { isOnline, pendingCount, syncStatus, mutate } = useOfflineMutation();

  const studentQuery = useQuery({
    queryKey: ["lms", "student", studentId],
    queryFn: () => lmsApi.getStudent(studentId),
  });

  const scoresQuery = useQuery({
    queryKey: ["lms", "scores", studentId],
    queryFn: () => lmsApi.getScores(studentId),
  });

  const chosenTalentsQuery = useQuery({
    queryKey: ["lms", "chosen-talents", studentId],
    queryFn: () => lmsApi.getChosenTalents(studentId),
  });

  const [raterType, setRaterType] = useState<"coach" | "student">("coach");
  const [timePoint, setTimePoint] = useState<"pre" | "end">("pre");
  const [localScores, setLocalScores] = useState<Record<TalentKey, number>>({
    confidence: 0,
    resilience: 0,
    communication: 0,
    selfAwareness: 0,
  });
  const [chosenTalents, setChosenTalents] = useState<Record<TalentKey, boolean>>({
    confidence: false,
    resilience: false,
    communication: false,
    selfAwareness: false,
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const student = studentQuery.data;
  const scores = scoresQuery.data ?? [];
  const chosenData = chosenTalentsQuery.data;

  useEffect(() => {
    const existing = scores.find(
      (s) => s.raterType === raterType && s.timePoint === timePoint,
    );
    if (existing) {
      setLocalScores({
        confidence: existing.confidence,
        resilience: existing.resilience,
        communication: existing.communication,
        selfAwareness: existing.selfAwareness,
      });
    } else {
      setLocalScores({ confidence: 0, resilience: 0, communication: 0, selfAwareness: 0 });
    }
  }, [scores, raterType, timePoint]);

  useEffect(() => {
    if (chosenData) setChosenTalents(chosenData);
  }, [chosenData]);

  useEffect(() => {
    if (syncStatus === "synced") {
      queryClient.invalidateQueries({ queryKey: ["lms", "scores", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "chosen-talents", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
    }
  }, [syncStatus, studentId, queryClient]);

  async function setScore(talent: TalentKey, value: number) {
    const newScores = { ...localScores, [talent]: value };
    setLocalScores(newScores);
    setSaveStatus("saving");

    const entry: ScoreEntry = { raterType, timePoint, ...newScores };
    const ok = await mutate("PUT", `/api/lms/students/${studentId}/scores`, entry);

    if (ok) {
      queryClient.invalidateQueries({ queryKey: ["lms", "scores", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus(isOnline ? "idle" : "saved");
      if (!isOnline) setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }

  async function toggleChosen(talent: TalentKey) {
    const newChosen = { ...chosenTalents, [talent]: !chosenTalents[talent] };
    setChosenTalents(newChosen);

    const ok = await mutate("PUT", `/api/lms/students/${studentId}/chosen-talents`, newChosen);
    if (ok) {
      queryClient.invalidateQueries({ queryKey: ["lms", "chosen-talents", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
    }
  }

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
          Scores — {student.firstName} {student.lastName}
        </h1>
      </div>

      {/* Rater type toggle */}
      <div className="mb-4 flex gap-2">
        {(["coach", "student"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRaterType(r)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              raterType === r
                ? "bg-[var(--color-warm-gold)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {r === "coach" ? "Coach Assessment" : "Student Self-Assessment"}
          </button>
        ))}
      </div>

      {/* Time point toggle */}
      <div className="mb-4 flex gap-2">
        {(["pre", "end"] as const).map((tp) => (
          <button
            key={tp}
            onClick={() => setTimePoint(tp)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              timePoint === tp
                ? "bg-[var(--color-deep-navy)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tp === "pre" ? "Pre-Programme" : "End-Programme"}
          </button>
        ))}
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

      {/* Talent scores */}
      <div className="grid gap-6">
        {TALENTS.map((talent) => (
          <div key={talent.key} className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">{talent.label}</p>
              {raterType === "coach" && (
                <button
                  onClick={() => toggleChosen(talent.key)}
                  className={`text-xs px-2 py-1 rounded ${
                    chosenTalents[talent.key]
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {chosenTalents[talent.key] ? "★ Chosen" : "Choose"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  onClick={() => setScore(talent.key, value)}
                  className={`flex-1 h-14 rounded-lg font-bold text-lg transition-all ${
                    localScores[talent.key] === value
                      ? "bg-[var(--color-warm-gold)] text-white shadow-md scale-105"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
