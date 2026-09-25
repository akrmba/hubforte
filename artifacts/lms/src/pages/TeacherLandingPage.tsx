import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { teacherApi } from "@/lib/api";

/**
 * Teacher landing page — /teacher
 * Session-cookie authenticated (set during token exchange via /enter).
 */
export function TeacherLandingPage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<{ students: { id: string; feedbackSubmitted: boolean }[] } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    teacherApi.getStudents()
      .then((d) => { setData(d); setStatus("ready"); })
      .catch((err) => { setStatus("error"); setErrorMsg(err.message || "Session expired. Please use your link again."); });
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8">
          <div className="w-10 h-10 border-4 border-[var(--color-warm-gold)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
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

  const total = data?.students.length ?? 0;
  const complete = data?.students.filter((s) => s.feedbackSubmitted).length ?? 0;

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-deep-navy)] mb-1">
            Yes Futures
          </h1>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 mb-6">
          <p className="text-gray-700 mb-4">
            You have <strong>{total} student{total !== 1 ? "s" : ""}</strong> to provide feedback for.
            This should take about 10–15 minutes.
          </p>
          <p className="text-sm text-gray-500">
            Your progress is saved automatically. You can close this page and return using the same link to continue.
          </p>
        </div>

        <button
          onClick={() => navigate("/teacher/students")}
          className="w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium text-lg hover:opacity-90 transition-opacity"
        >
          Start ({complete} of {total} complete)
        </button>
      </div>
    </div>
  );
}
