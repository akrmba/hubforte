import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, Upload, AlertCircle, CheckCircle2 } from "lucide-react";

const COLUMN_MAP: Record<string, string> = {
  "first name": "firstName",
  "firstname": "firstName",
  "last name": "lastName",
  "lastname": "lastName",
  "surname": "lastName",
  "gender": "gender",
  "year group": "yearGroup",
  "year": "yearGroup",
  "pupil premium": "pupilPremiumFlag",
  "pp": "pupilPremiumFlag",
  "send": "senStage",
  "eal": "ealFlag",
  "care experienced": "careExperiencedFlag",
  "looked after": "lookedAfterFlag",
  "coach": "coachId",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const mapped = COLUMN_MAP[h] ?? h;
      row[mapped] = values[i] ?? "";
    });
    return row;
  });
}

interface PreviewRow {
  rowIndex: number;
  data: Record<string, string>;
  valid: boolean;
  errors: string[];
}

interface PreviewResponse {
  cohortId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  preview: PreviewRow[];
}

type Stage = "upload" | "preview" | "done";

export function StudentImportPage() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId!;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("upload");
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError("Could not parse CSV. Check the file has headers and at least one row.");
        return;
      }
      setRawRows(rows);
      setLoading(true);
      try {
        const data = await api.post<PreviewResponse>(
          `/api/lms/students/cohorts/${cohortId}/students/import/preview`,
          { rows },
        );
        setPreviewData(data);
        setStage("preview");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Preview failed.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  }

  async function applyImport() {
    if (!previewData) return;
    setLoading(true);
    setError("");
    try {
      const validRows = previewData.preview.filter((r) => r.valid).map((r) => r.data);
      const data = await api.post<{ imported: number }>(
        `/api/lms/students/cohorts/${cohortId}/students/import/apply`,
        { rows: validRows },
      );
      setResult(data);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: ["lms", "cohort-students", cohortId] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/cohorts/${cohortId}/students`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={16} /> Back to students
      </Link>

      <h1 className="text-xl font-bold mb-2">Import Students from CSV</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload a CSV with columns: First Name, Last Name, Gender, Year Group, Pupil Premium, SEND, EAL, Care Experienced.
      </p>

      {/* Stage: upload */}
      {stage === "upload" && (
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${loading ? "border-gray-200 opacity-50" : "border-gray-300 hover:border-[var(--color-warm-gold)]"}`}
          onClick={() => !loading && fileRef.current?.click()}
        >
          <Upload size={36} className="mx-auto mb-3 text-gray-400" />
          <p className="font-medium text-gray-600">{loading ? "Validating..." : "Click to upload CSV"}</p>
          <p className="text-sm text-gray-400 mt-1">or drag and drop</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mt-4">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Stage: preview */}
      {stage === "preview" && previewData && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">
                {previewData.validRows} valid / {previewData.totalRows} total rows
              </p>
              {previewData.invalidRows > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">{previewData.invalidRows} rows will be skipped (missing required fields)</p>
              )}
            </div>
            <button
              onClick={() => { setStage("upload"); setPreviewData(null); setRawRows([]); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-4 max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Valid</th>
                  {Object.keys(previewData.preview[0]?.data ?? {}).map((k) => (
                    <th key={k} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.preview.slice(0, 20).map((row) => (
                  <tr key={row.rowIndex} className={`border-t border-gray-50 ${!row.valid ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2">
                      {row.valid
                        ? <CheckCircle2 size={14} className="text-green-500" />
                        : <AlertCircle size={14} className="text-red-500" />
                      }
                    </td>
                    {Object.values(row.data).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">{v || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewData.totalRows > 20 && (
            <p className="text-xs text-gray-400 mb-4">Showing first 20 of {previewData.totalRows} rows.</p>
          )}

          <button
            onClick={applyImport}
            disabled={loading || previewData.validRows === 0}
            className="w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Importing..." : `Import ${previewData.validRows} Students`}
          </button>
        </div>
      )}

      {/* Stage: done */}
      {stage === "done" && result && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 size={28} className="text-green-500" />
            <p className="font-semibold">{result.imported} students imported</p>
          </div>
          <Link
            href={`/cohorts/${cohortId}/students`}
            className="inline-block px-4 py-2 bg-[var(--color-deep-navy)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            View Students
          </Link>
        </div>
      )}
    </div>
  );
}
