import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pmApi } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

export function AddStudentPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    yearGroup: "",
    gender: "",
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => pmApi.createStudent(cohortId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "cohort-students", cohortId] });
      navigate(`/cohorts/${cohortId}/students`);
    },
    onError: (err: Error) => setError(err.message || "Failed to add student."),
  });

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setError("");
    mutation.mutate();
  }

  return (
    <div className="max-w-lg">
      <Link
        href={`/cohorts/${cohortId}/students`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={16} /> Back to students
      </Link>

      <h1 className="text-xl font-bold mb-6">Add Student</h1>

      <form onSubmit={submit} className="bg-white p-6 rounded-xl border border-gray-200 grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">First Name</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Last Name</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Year Group</label>
          <input
            type="text"
            value={form.yearGroup}
            onChange={(e) => set("yearGroup", e.target.value)}
            placeholder="e.g. Year 10"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Gender</label>
          <select
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {mutation.isPending ? "Adding..." : "Add Student"}
        </button>
      </form>
    </div>
  );
}
