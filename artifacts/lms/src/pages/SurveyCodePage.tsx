import { useState } from "react";
import { useLocation } from "wouter";

/**
 * Survey via URL code — /survey/code
 * Student enters their 6-character personal access code.
 * Exchanges it for a session cookie via POST /api/lms/public/exchange-code,
 * then redirects to /survey.
 */
export function SurveyCodePage() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/lms/public/exchange-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Invalid code" }));
        throw new Error(body.error || "That code doesn't match. Check with your coach.");
      }

      navigate("/survey");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)] p-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-deep-navy)]">Enter Your Code</h1>
          <p className="text-gray-500 text-sm mt-2">
            Your coach will have given you a personal code to access your survey.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white p-6 rounded-xl border border-gray-200">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB1234"
            maxLength={10}
            autoFocus
            className="w-full px-4 py-4 border border-gray-300 rounded-lg text-2xl font-mono text-center tracking-widest uppercase mb-4"
          />

          {status === "error" && (
            <p className="text-red-500 text-sm text-center mb-4">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !code.trim()}
            className="w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === "loading" ? "Checking..." : "Start Survey"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          If your code doesn't work, ask your coach for a new one.
        </p>
      </div>
    </div>
  );
}
