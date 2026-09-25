import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { lmsApi } from "@/lib/api";
import { ArrowLeft, Check, X, Save, WifiOff, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";

export function AttendancePage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId!;
  const queryClient = useQueryClient();
  const { isOnline, pendingCount, syncStatus, mutate } = useOfflineMutation();

  const studentQuery = useQuery({
    queryKey: ["lms", "student", studentId],
    queryFn: () => lmsApi.getStudent(studentId),
  });

  const student = studentQuery.data;
  const cohortId = student?.cohortId;

  const attendanceQuery = useQuery({
    queryKey: ["lms", "attendance", cohortId],
    queryFn: () => lmsApi.getAttendance(cohortId!),
    enabled: !!cohortId,
  });

  const [localRecords, setLocalRecords] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const attendanceData = attendanceQuery.data;
  const sessions = attendanceData?.sessions ?? [];
  const studentGrid = attendanceData?.grid.find((g) => g.student.id === studentId);

  useEffect(() => {
    if (studentGrid) {
      const initial: Record<string, boolean> = {};
      studentGrid.sessions.forEach((s) => {
        if (s.attended !== null) {
          initial[s.sessionId] = s.attended;
        }
      });
      setLocalRecords(initial);
    }
  }, [studentGrid]);

  // Invalidate queries after sync completes
  useEffect(() => {
    if (syncStatus === "synced") {
      queryClient.invalidateQueries({ queryKey: ["lms", "attendance", cohortId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
    }
  }, [syncStatus, cohortId, studentId, queryClient]);

  async function toggleAttendance(sessionId: string) {
    const newValue = !localRecords[sessionId];
    setLocalRecords((prev) => ({ ...prev, [sessionId]: newValue }));
    setSaveStatus("saving");

    const ok = await mutate("PUT", "/api/lms/attendance", {
      records: [{
        studentId,
        sessionId,
        attended: newValue,
        attendanceStatus: newValue ? "PRESENT" : "ABSENT",
      }],
    });

    if (ok) {
      queryClient.invalidateQueries({ queryKey: ["lms", "attendance", cohortId] });
      queryClient.invalidateQueries({ queryKey: ["lms", "student-completeness", studentId] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else if (isOnline) {
      setSaveStatus("idle");
    } else {
      setSaveStatus("saved"); // queued — treat as "saved locally"
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }

  if (studentQuery.isLoading || attendanceQuery.isLoading) {
    return <p className="text-gray-500 py-8 text-center">Loading...</p>;
  }

  if (!student) {
    return <p className="text-red-500 py-8 text-center">Student not found</p>;
  }

  const attendedCount = Object.values(localRecords).filter(Boolean).length;

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
          Attendance — {student.firstName} {student.lastName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {attendedCount} of {sessions.length} sessions attended
        </p>
      </div>

      {/* Sync / save status */}
      <div className="mb-4 flex items-center gap-2 text-sm min-h-[24px]">
        {!isOnline && (
          <>
            <WifiOff size={14} className="text-amber-500" />
            <span className="text-amber-600">
              Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount > 1 ? "s" : ""} queued` : ""}
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

      {/* Session list */}
      <div className="grid gap-3">
        {sessions.map((session) => {
          const attended = localRecords[session.id] ?? false;
          return (
            <button
              key={session.id}
              onClick={() => toggleAttendance(session.id)}
              className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                attended
                  ? "bg-green-50 border-green-300 hover:border-green-400"
                  : "bg-gray-50 border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-left">
                <p className="font-semibold text-sm">
                  Session {session.sessionNumber}
                  {session.sessionType && ` — ${session.sessionType}`}
                </p>
                {session.sessionDate && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(session.sessionDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  attended ? "bg-green-500 text-white" : "bg-gray-300 text-gray-500"
                }`}
              >
                {attended ? <Check size={24} /> : <X size={24} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
