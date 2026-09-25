import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pmApi } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const PROGRAMME_TYPES: Array<{ value: "rising_futures" | "finding_futures" | "launching_futures"; label: string }> = [
  { value: "rising_futures", label: "Rising Futures" },
  { value: "finding_futures", label: "Finding Futures" },
  { value: "launching_futures", label: "Launching Futures" },
];

export function CreateCohortPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    cohortName: "",
    programmeId: "",
    programmeType: "rising_futures" as "rising_futures" | "finding_futures" | "launching_futures",
    leadTeacherName: "",
    minAttendanceSessions: 6,
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => pmApi.createCohort(form),
    onSuccess: (cohort) => {
      queryClient.invalidateQueries({ queryKey: ["lms", "cohorts"] });
      queryClient.invalidateQueries({ queryKey: ["lms", "dashboard"] });
      navigate(`/cohorts/${cohort.id}`);
    },
    onError: (err: Error) => setError(err.message || "Failed to create cohort."),
  });

  function set(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cohortName.trim()) { setError("Cohort name is required."); return; }
    if (!form.programmeId.trim()) { setError("Programme ID is required."); return; }
    setError("");
    mutation.mutate();
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/cohorts"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={16} /> Back to cohorts
      </Link>

      <h1 className="text-2xl font-bold text-[var(--color-deep-navy)] mb-6">New Cohort</h1>

      <form onSubmit={submit} className="bg-white p-6 rounded-xl border border-gray-200 grid gap-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Cohort Name</label>
          <input
            type="text"
            value={form.cohortName}
            onChange={(e) => set("cohortName", e.target.value)}
            placeholder="e.g. Greenfield Academy RF 2025-26"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Programme ID</label>
          <input
            type="text"
            value={form.programmeId}
            onChange={(e) => set("programmeId", e.target.value)}
            placeholder="e.g. prog_abc123"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">The programme this cohort belongs to.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Programme Type</label>
          <select
            value={form.programmeType}
            onChange={(e) => set("programmeType", e.target.value as "rising_futures" | "finding_futures" | "launching_futures")}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {PROGRAMME_TYPES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Lead Teacher Name</label>
          <input
            type="text"
            value={form.leadTeacherName}
            onChange={(e) => set("leadTeacherName", e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Minimum Attendance Sessions</label>
          <input
            type="number"
            min={1}
            max={8}
            value={form.minAttendanceSessions}
            onChange={(e) => set("minAttendanceSessions", Number(e.target.value))}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Default is 6 out of 8 sessions.</p>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {mutation.isPending ? "Creating..." : "Create Cohort"}
        </button>
      </form>
    </div>
  );
}
