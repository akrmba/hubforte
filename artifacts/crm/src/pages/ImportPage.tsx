import React, { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2,
  AlertTriangle, Loader2, History,
} from "lucide-react";

type Step = "source" | "upload" | "map" | "validate" | "importing";

interface FieldMapping {
  csvColumn: string;
  crmField: string;
}

const ENTITY_TYPES = [
  { value: "contacts", label: "Contacts", description: "People you work with" },
  { value: "organizations", label: "Organisations", description: "Companies, schools, trusts" },
  { value: "volunteers", label: "Volunteers", description: "Volunteer records" },
  { value: "students", label: "Students", description: "Student records" },
];

const SOURCES = [
  { slug: "salesforce", name: "Salesforce", icon: "SF" },
  { slug: "hubspot", name: "HubSpot", icon: "HS" },
  { slug: "pipedrive", name: "Pipedrive", icon: "PD" },
  { slug: "zoho", name: "Zoho CRM", icon: "ZO" },
  { slug: "generic", name: "CSV / Spreadsheet", icon: "CSV" },
  { slug: "generic", name: "Other CRM", icon: "..." },
];

export default function ImportPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("source");
  const [selectedSource, setSelectedSource] = useState("");
  const [entityType, setEntityType] = useState("contacts");
  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "create">("skip");
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      toast({ title: "Invalid file type", description: "Please upload a CSV file. Export your data as CSV from your CRM first.", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 50MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setFileId(data.fileId);
      setFileName(data.fileName);
      setHeaders(data.headers);
      setPreview(data.preview);
      setTotalRows(data.totalRows);

      const mapRes = await api.post<any>("/import/auto-map", {
        fileId: data.fileId,
        entityType,
        presetSlug: selectedSource,
      });
      setMappings(mapRes.mappings || []);
      setAvailableFields(mapRes.availableFields || []);
      setRequiredFields(mapRes.requiredFields || []);
      setStep("map");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [entityType, selectedSource, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await api.post<any>("/import/validate", { fileId, entityType, fieldMapping: mappings });
      setValidationResult(res);
      setStep("validate");
    } catch (err: any) {
      toast({ title: "Validation failed", description: err.message || err.error, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    setImporting(true);
    try {
      const res = await api.post<any>("/import/execute", { fileId, entityType, fieldMapping: mappings, duplicateAction });
      setStep("importing");
      pollStatus(res.jobId);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      setImporting(false);
    }
  };

  const pollStatus = async (id: string) => {
    const poll = async () => {
      try {
        const res = await api.get<any>(`/import/jobs/${id}`);
        setJobStatus(res);
        if (res.status === "PROCESSING") {
          setTimeout(poll, 2000);
        } else {
          setImporting(false);
        }
      } catch {
        setImporting(false);
      }
    };
    poll();
  };

  const loadHistory = async () => {
    try {
      const res = await api.get<any[]>("/import/history");
      setHistory(res);
      setShowHistory(true);
    } catch {}
  };

  const updateMapping = (csvCol: string, crmField: string) => {
    setMappings(prev => {
      const filtered = prev.filter(m => m.csvColumn !== csvCol);
      if (crmField === "__skip__") return filtered;
      return [...filtered, { csvColumn: csvCol, crmField }];
    });
  };

  const getMappedField = (csvCol: string) => {
    return mappings.find(m => m.csvColumn === csvCol)?.crmField || "__skip__";
  };

  const reset = () => {
    setStep("source");
    setFileId("");
    setFileName("");
    setHeaders([]);
    setPreview([]);
    setMappings([]);
    setValidationResult(null);
    setJobStatus(null);
    setShowHistory(false);
  };

  if (showHistory) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Import History</h1>
          <Button variant="outline" onClick={() => setShowHistory(false)}>Back to Import</Button>
        </div>
        {history.length === 0 ? (
          <p className="text-gray-500">No imports yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((job: any) => (
              <Card key={job.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{job.fileName || job.entityType}</span>
                    <span className="text-sm text-gray-500 ml-2">{job.entityType}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-600">{job.successRows} imported</span>
                    {job.skippedRows > 0 && <span className="text-yellow-600">{job.skippedRows} skipped</span>}
                    {job.errorRows > 0 && <span className="text-red-600">{job.errorRows} errors</span>}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${job.status === "COMPLETE" ? "bg-green-100 text-green-700" : job.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {job.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Import Data</h1>
        <Button variant="outline" size="sm" onClick={loadHistory}>
          <History className="h-4 w-4 mr-1.5" /> Import History
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["source", "upload", "map", "validate", "importing"] as Step[]).map((s, i) => {
          const labels = ["Choose Source", "Upload File", "Map Fields", "Validate", "Import"];
          const isActive = s === step;
          const isPast = (["source", "upload", "map", "validate", "importing"] as Step[]).indexOf(step) > i;
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className="h-px w-6 bg-gray-300" />}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isActive ? "bg-blue-100 text-blue-700" : isPast ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {isPast ? <CheckCircle2 className="h-3 w-3" /> : <span>{i + 1}</span>}
                {labels[i]}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Choose Source */}
      {step === "source" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Where is your data coming from?</h2>
            <p className="text-sm text-gray-500">Select your CRM to auto-map column names, or choose CSV for manual mapping.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SOURCES.map((src, i) => (
              <Card
                key={i}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedSource === src.slug ? "ring-2 ring-blue-500 bg-blue-50" : ""}`}
                onClick={() => setSelectedSource(src.slug)}
              >
                <CardContent className="py-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                    {src.icon}
                  </div>
                  <span className="font-medium">{src.name}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">What are you importing?</h3>
            <div className="grid grid-cols-2 gap-2">
              {ENTITY_TYPES.map(et => (
                <Card
                  key={et.value}
                  className={`cursor-pointer transition-all hover:shadow-md ${entityType === et.value ? "ring-2 ring-blue-500 bg-blue-50" : ""}`}
                  onClick={() => setEntityType(et.value)}
                >
                  <CardContent className="py-3">
                    <div className="font-medium text-sm">{et.label}</div>
                    <div className="text-xs text-gray-500">{et.description}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep("upload")} disabled={!selectedSource}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === "upload" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Upload your file</h2>
            <p className="text-sm text-gray-500">CSV files accepted. Maximum 50MB.</p>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-600">Parsing file...</p>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 mb-2">Drag and drop your file here, or</p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
                <p className="text-xs text-gray-400 mt-3">CSV files only (max 50MB). Export from your CRM as CSV first.</p>
              </>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("source")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Map Fields */}
      {step === "map" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Map your columns</h2>
            <p className="text-sm text-gray-500">
              {fileName} — {totalRows} rows detected. Match each CSV column to a CRM field.
            </p>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="text-xs w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t">
                      {headers.map(h => <td key={h} className="px-3 py-1.5 text-gray-500 truncate max-w-[150px]">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border rounded-lg divide-y">
            {headers.map(h => {
              const mapped = getMappedField(h);
              const isRequired = requiredFields.includes(mapped);
              return (
                <div key={h} className="flex items-center gap-4 px-4 py-2.5">
                  <div className="w-1/3 text-sm font-medium truncate" title={h}>{h}</div>
                  <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <select
                    className="flex-1 text-sm border rounded px-2 py-1.5 bg-white"
                    value={mapped}
                    onChange={e => updateMapping(h, e.target.value)}
                  >
                    <option value="__skip__">Skip this column</option>
                    {availableFields.map(f => (
                      <option key={f} value={f}>
                        {f}{requiredFields.includes(f) ? " *" : ""}
                      </option>
                    ))}
                  </select>
                  {isRequired && <span className="text-xs text-red-500 flex-shrink-0">Required</span>}
                </div>
              );
            })}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={handleValidate} disabled={validating || mappings.length === 0}>
              {validating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Validate <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Validate */}
      {step === "validate" && validationResult && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Validation Results</h2>
            <p className="text-sm text-gray-500">{totalRows} rows checked.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold text-green-600">{validationResult.validRows}</div>
                <div className="text-xs text-gray-500">Valid rows</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold text-yellow-600">{validationResult.duplicateRows}</div>
                <div className="text-xs text-gray-500">Duplicates found</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold text-red-600">{validationResult.errorRows}</div>
                <div className="text-xs text-gray-500">Errors</div>
              </CardContent>
            </Card>
          </div>

          {validationResult.duplicateRows > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How should we handle duplicates?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { value: "skip", label: "Skip duplicates", desc: "Existing records are kept unchanged" },
                  { value: "update", label: "Update existing", desc: "Overwrite existing records with new data" },
                  { value: "create", label: "Create anyway", desc: "Import as new records even if duplicates exist" },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer ${duplicateAction === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                    <input type="radio" name="dup" value={opt.value} checked={duplicateAction === opt.value} onChange={() => setDuplicateAction(opt.value as any)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {validationResult.errors?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Errors (first 20)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {validationResult.errors.slice(0, 20).map((err: any, i: number) => (
                    <div key={i} className="text-xs text-red-600">
                      Row {err.row}: {err.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("map")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={handleExecute} disabled={importing || validationResult.validRows === 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Import {validationResult.validRows} rows
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Importing / Complete */}
      {step === "importing" && (
        <div className="space-y-4">
          {!jobStatus || jobStatus.status === "PROCESSING" ? (
            <div className="text-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold">Importing your data...</h2>
              {jobStatus && (
                <div className="mt-4 space-y-2">
                  <div className="w-64 mx-auto bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${jobStatus.totalRows ? (jobStatus.processedRows / jobStatus.totalRows) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500">{jobStatus.processedRows} / {jobStatus.totalRows} rows processed</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              {jobStatus.status === "COMPLETE" ? (
                <>
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold">Import Complete</h2>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold">Import Failed</h2>
                </>
              )}

              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div><span className="font-bold text-green-600">{jobStatus.successRows}</span> imported</div>
                <div><span className="font-bold text-yellow-600">{jobStatus.skippedRows}</span> skipped</div>
                <div><span className="font-bold text-red-600">{jobStatus.errorRows}</span> errors</div>
              </div>

              {jobStatus.errors?.length > 0 && (
                <div className="mt-4 max-w-md mx-auto text-left">
                  <p className="text-xs font-medium text-gray-500 mb-1">Errors:</p>
                  <div className="max-h-32 overflow-y-auto text-xs text-red-600 space-y-0.5">
                    {jobStatus.errors.slice(0, 20).map((err: any, i: number) => (
                      <div key={i}>Row {err.row}: {err.message}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3 mt-6">
                <Button variant="outline" onClick={loadHistory}>
                  <History className="h-4 w-4 mr-1.5" /> View History
                </Button>
                <Button onClick={reset}>Import More Data</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
