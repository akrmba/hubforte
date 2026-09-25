import { useState, useEffect } from "react";
import { getOutcomeFrameworks, getOutcomeRecords, createOutcomeRecord } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const measurementTypeColors: Record<string, string> = {
  NUMERIC: "bg-blue-100 text-blue-800",
  SCALE: "bg-purple-100 text-purple-800",
  BOOLEAN: "bg-green-100 text-green-800",
  TEXT: "bg-gray-100 text-gray-800",
  RUBRIC: "bg-yellow-100 text-yellow-800",
};

export default function OutcomesPage() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"frameworks" | "records">("frameworks");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    frameworkId: "",
    studentId: "",
    value: "",
    measurementDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const loadFrameworks = async () => {
    try {
      const res = await getOutcomeFrameworks();
      setFrameworks(res.data || []);
    } catch {
      setFrameworks([]);
    }
  };

  const loadRecords = async () => {
    try {
      const res = await getOutcomeRecords();
      setRecords(res.data || []);
    } catch {
      setRecords([]);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFrameworks(), loadRecords()]).finally(() => setLoading(false));
  }, []);

  const handleCreateRecord = async () => {
    if (!form.frameworkId || !form.studentId || !form.value) return;
    await createOutcomeRecord(form);
    setForm({ frameworkId: "", studentId: "", value: "", measurementDate: new Date().toISOString().split("T")[0], notes: "" });
    setShowForm(false);
    loadRecords();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Outcomes</h1>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "frameworks" ? "default" : "outline"}
            onClick={() => setActiveTab("frameworks")}
          >
            Frameworks
          </Button>
          <Button
            variant={activeTab === "records" ? "default" : "outline"}
            onClick={() => setActiveTab("records")}
          >
            Records
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : activeTab === "frameworks" ? (
        <>
          {frameworks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No outcome frameworks configured. Ask an admin to create one.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {frameworks.map((f: any) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{f.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-gray-600">{f.description || "No description"}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge className={measurementTypeColors[f.measurementType] || ""}>
                        {f.measurementType}
                      </Badge>
                      {f.category && (
                        <Badge variant="outline">{f.category}</Badge>
                      )}
                    </div>
                    {f.scaleMin !== null && f.scaleMax !== null && (
                      <p className="text-xs text-gray-500">
                        Scale: {f.scaleMin} - {f.scaleMax}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "Record Outcome"}
            </Button>
          </div>

          {showForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.frameworkId}
                  onChange={(e) => setForm({ ...form, frameworkId: e.target.value })}
                >
                  <option value="">Select Framework</option>
                  {frameworks.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Student ID"
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                />
                <div className="flex gap-4">
                  <input
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="Value"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                  <input
                    type="date"
                    className="w-48 border rounded px-3 py-2"
                    value={form.measurementDate}
                    onChange={(e) => setForm({ ...form, measurementDate: e.target.value })}
                  />
                </div>
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Notes (optional)"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <Button onClick={handleCreateRecord}>Save Record</Button>
              </CardContent>
            </Card>
          )}

          {records.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No outcome records yet. Record one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Framework</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {records.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{r.frameworkName || r.frameworkId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.studentName || r.studentId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{r.value}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.measurementDate || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{r.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
