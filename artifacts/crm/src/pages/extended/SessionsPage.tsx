import { useState, useEffect } from "react";
import { Link } from "wouter";
import { getProgrammeSessions, createProgrammeSession } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  RESCHEDULED: "bg-yellow-100 text-yellow-800",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ programmeId: "", sessionDate: "", startTime: "", endTime: "", venue: "", topic: "", deliveryFormat: "IN_PERSON" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getProgrammeSessions();
      setSessions(res.data || []);
    } catch { setSessions([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.programmeId) return;
    await createProgrammeSession(form);
    setForm({ programmeId: "", sessionDate: "", startTime: "", endTime: "", venue: "", topic: "", deliveryFormat: "IN_PERSON" });
    setShowForm(false);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Programme Sessions</h1>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "New Session"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <input className="w-full border rounded px-3 py-2" placeholder="Programme ID" value={form.programmeId} onChange={e => setForm({...form, programmeId: e.target.value})} />
            <input className="w-full border rounded px-3 py-2" placeholder="Topic" value={form.topic} onChange={e => setForm({...form, topic: e.target.value})} />
            <div className="flex gap-4">
              <input type="date" className="flex-1 border rounded px-3 py-2" value={form.sessionDate} onChange={e => setForm({...form, sessionDate: e.target.value})} />
              <input type="time" className="w-32 border rounded px-3 py-2" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
              <input type="time" className="w-32 border rounded px-3 py-2" value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
            </div>
            <div className="flex gap-4">
              <input className="flex-1 border rounded px-3 py-2" placeholder="Venue" value={form.venue} onChange={e => setForm({...form, venue: e.target.value})} />
              <select className="w-40 border rounded px-3 py-2" value={form.deliveryFormat} onChange={e => setForm({...form, deliveryFormat: e.target.value})}>
                <option value="IN_PERSON">In Person</option>
                <option value="VIRTUAL">Virtual</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <Button onClick={handleCreate}>Create Session</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : sessions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No sessions yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Topic</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Format</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sessions.map((s: any) => (
                <tr key={s.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.sessionNumber || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/ext/sessions/${s.id}`} className="text-blue-600 hover:underline">{s.topic || "Untitled"}</Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.sessionDate || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {s.startTime || "—"} – {s.endTime || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.venue || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.deliveryFormat || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={statusColors[s.status] || ""}>{s.status}</Badge>
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
