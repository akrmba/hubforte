import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";

const TRIGGER_EVENTS = ["ON_CREATE", "ON_UPDATE", "ON_DELETE", "SCHEDULED"];
const ENTITY_TYPES = ["organizations", "contacts", "students", "volunteers", "programmes", "consent_records", "funding_opportunities"];

export default function AutomationPage() {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", entityType: "contacts", triggerEvent: "ON_UPDATE", conditions: "[]", actions: "[]", active: true });
  const [error, setError] = useState("");

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automation-rules", { headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "include" });
      const data = await res.json();
      setRules(data.data || []);
    } catch { setRules([]); }
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  const handleCreate = async () => {
    setError("");
    try {
      let conditions, actions;
      try { conditions = JSON.parse(form.conditions); actions = JSON.parse(form.actions); }
      catch { setError("Conditions and Actions must be valid JSON arrays"); return; }
      const res = await fetch("/api/automation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ ...form, conditions, actions }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); return; }
      setShowForm(false);
      setForm({ name: "", entityType: "contacts", triggerEvent: "ON_UPDATE", conditions: "[]", actions: "[]", active: true });
      loadRules();
    } catch (e: any) { setError(e.message); }
  };

  const handleToggle = async (id: string) => {
    await fetch(`/api/automation-rules/${id}/toggle`, { method: "PATCH", headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "include" });
    loadRules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/automation-rules/${id}`, { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "include" });
    loadRules();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Automation Rules</h1>
        {isAdmin && <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "New Rule"}</Button>}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <input className="w-full border rounded px-3 py-2" placeholder="Rule name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div className="flex gap-4">
              <select className="flex-1 border rounded px-3 py-2" value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value })}>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="flex-1 border rounded px-3 py-2" value={form.triggerEvent} onChange={e => setForm({ ...form, triggerEvent: e.target.value })}>
                {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <textarea className="w-full border rounded px-3 py-2 font-mono text-sm min-h-[80px]" placeholder='Conditions JSON (e.g. [{"field":"status","operator":"changed_to","value":"INACTIVE"}])' value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} />
            <textarea className="w-full border rounded px-3 py-2 font-mono text-sm min-h-[80px]" placeholder='Actions JSON (e.g. [{"type":"SEND_NOTIFICATION","userId":"...","title":"...","message":"..."}])' value={form.actions} onChange={e => setForm({ ...form, actions: e.target.value })} />
            <Button onClick={handleCreate}>Create Rule</Button>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="text-gray-500">Loading...</p> : rules.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No automation rules yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: any) => (
            <Card key={rule.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant="outline">{rule.entityType}</Badge>
                    <Badge variant="outline">{rule.triggerEvent}</Badge>
                    <Badge className={rule.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>{rule.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Runs: {rule.runCount} {rule.lastRunAt ? `· Last: ${new Date(rule.lastRunAt).toLocaleString()}` : ""}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handleToggle(rule.id)}>{rule.active ? "Disable" : "Enable"}</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(rule.id)}>Delete</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
