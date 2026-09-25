import { useState, useEffect } from "react";
import { Link } from "wouter";
import { getProgrammeCohorts, createProgrammeCohort, deleteProgrammeCohort } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const statusColors: Record<string, string> = {
  PLANNED: "bg-gray-100 text-gray-800",
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ programmeId: "", cohortName: "", startDate: "", endDate: "", capacity: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getProgrammeCohorts();
      setCohorts(res.data || []);
    } catch { setCohorts([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.programmeId || !form.cohortName) return;
    await createProgrammeCohort(form);
    setForm({ programmeId: "", cohortName: "", startDate: "", endDate: "", capacity: "" });
    setShowForm(false);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Programme Cohorts</h1>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "New Cohort"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <input className="w-full border rounded px-3 py-2" placeholder="Programme ID" value={form.programmeId} onChange={e => setForm({...form, programmeId: e.target.value})} />
            <input className="w-full border rounded px-3 py-2" placeholder="Cohort Name" value={form.cohortName} onChange={e => setForm({...form, cohortName: e.target.value})} />
            <div className="flex gap-4">
              <input type="date" className="flex-1 border rounded px-3 py-2" placeholder="Start Date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
              <input type="date" className="flex-1 border rounded px-3 py-2" placeholder="End Date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
              <input type="number" className="w-32 border rounded px-3 py-2" placeholder="Capacity" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} />
            </div>
            <Button onClick={handleCreate}>Create Cohort</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : cohorts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No cohorts yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrolled / Capacity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cohorts.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/cohorts/${c.id}`} className="text-blue-600 hover:underline">{c.cohortName}</Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={statusColors[c.status] || ""}>{c.status}</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {c.startDate || "—"} → {c.endDate || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {c.enrolledCount ?? 0} / {c.capacity ?? "∞"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
