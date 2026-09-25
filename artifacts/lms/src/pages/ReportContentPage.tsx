import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { pmApi } from "@/lib/api";
import type { TripData, CohortNarratives } from "@/lib/api";
import { ArrowLeft, Save, Check } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

function TripSection({
  title,
  tripType,
  tripData,
  cohortId,
}: {
  title: string;
  tripType: "itw" | "wow";
  tripData: TripData | null | undefined;
  cohortId: string;
}) {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<Partial<TripData>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tripData) setLocal(tripData);
  }, [tripData]);

  const saveMutation = useMutation({
    mutationFn: (fields: Partial<TripData>) =>
      pmApi.putTripData(cohortId, { ...fields, tripType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "trip-data", cohortId] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const debouncedSave = useCallback(
    (fields: Partial<TripData>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSaveStatus("saving");
        saveMutation.mutate(fields);
      }, 800);
    },
    [saveMutation],
  );

  function update(key: keyof TripData, value: string) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    debouncedSave(updated);
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-1.5 text-xs min-h-[20px]">
          {saveStatus === "saving" && <><Save size={12} className="animate-pulse text-amber-500" /><span className="text-amber-600">Saving...</span></>}
          {saveStatus === "saved" && <><Check size={12} className="text-green-500" /><span className="text-green-600">Saved</span></>}
        </div>
      </div>

      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Venue Name</label>
          <input
            type="text"
            value={(local.venueName as string) ?? ""}
            onChange={(e) => update("venueName", e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Featured Student Quote</label>
          <textarea
            value={(local.featuredStudentQuote as string) ?? ""}
            onChange={(e) => update("featuredStudentQuote", e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Featured Coach Quote</label>
          <textarea
            value={(local.featuredCoachQuote as string) ?? ""}
            onChange={(e) => update("featuredCoachQuote", e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y"
          />
        </div>
      </div>
    </div>
  );
}

export function ReportContentPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;
  const queryClient = useQueryClient();

  const cohortQuery = useQuery({
    queryKey: ["lms", "cohort", cohortId],
    queryFn: () => pmApi.getCohort(cohortId),
  });

  const tripDataQuery = useQuery({
    queryKey: ["lms", "trip-data", cohortId],
    queryFn: () => pmApi.getTripData(cohortId),
  });

  const narrativesQuery = useQuery({
    queryKey: ["lms", "cohort-narratives", cohortId],
    queryFn: () => pmApi.getCohortNarratives(cohortId),
  });

  const [localNarr, setLocalNarr] = useState<Partial<CohortNarratives>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (narrativesQuery.data) setLocalNarr(narrativesQuery.data);
  }, [narrativesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (fields: Partial<CohortNarratives>) =>
      pmApi.putCohortNarratives(cohortId, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms", "cohort-narratives", cohortId] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const debouncedSave = useCallback(
    (fields: Partial<CohortNarratives>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSaveStatus("saving");
        saveMutation.mutate(fields);
      }, 800);
    },
    [saveMutation],
  );

  function updateNarr(key: keyof CohortNarratives, value: string) {
    const updated = { ...localNarr, [key]: value };
    setLocalNarr(updated);
    debouncedSave(updated);
  }

  const NARR_FIELDS: Array<{ key: keyof CohortNarratives; label: string }> = [
    { key: "programmeStrengths", label: "Programme Strengths" },
    { key: "programmeChallenges", label: "Programme Challenges" },
    { key: "overallAssessment", label: "Overall Assessment" },
    { key: "conclusionNarrative", label: "Conclusion Narrative" },
    { key: "featuredStudentQuote", label: "Featured Student Quote" },
  ];

  return (
    <div>
      <Link
        href={`/cohorts/${cohortId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Back to cohort
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">Report Content</h1>
        {cohortQuery.data && <p className="text-sm text-gray-500 mt-0.5">{cohortQuery.data.cohortName}</p>}
      </div>

      <div className="grid gap-6">
        <TripSection title="Into the Wild" tripType="itw" tripData={tripDataQuery.data?.itw} cohortId={cohortId} />
        <TripSection title="World of Work" tripType="wow" tripData={tripDataQuery.data?.wow} cohortId={cohortId} />

        {/* Cohort narratives */}
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Cohort Narratives</h2>
            <div className="flex items-center gap-1.5 text-xs min-h-[20px]">
              {saveStatus === "saving" && <><Save size={12} className="animate-pulse text-amber-500" /><span className="text-amber-600">Saving...</span></>}
              {saveStatus === "saved" && <><Check size={12} className="text-green-500" /><span className="text-green-600">Saved</span></>}
            </div>
          </div>
          <div className="grid gap-4">
            {NARR_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1.5">{label}</label>
                <textarea
                  value={(localNarr[key] as string) ?? ""}
                  onChange={(e) => updateNarr(key, e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
