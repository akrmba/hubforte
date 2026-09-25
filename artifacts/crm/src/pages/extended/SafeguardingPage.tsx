import { useState, useEffect } from "react";
import { getSafeguardingNotes, createSafeguardingNote, getSafeguardingAccessLogs } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const severityColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
  ESCALATED: "bg-red-100 text-red-800",
};

const confidentialityColors: Record<string, string> = {
  STANDARD: "bg-gray-100 text-gray-700",
  RESTRICTED: "bg-orange-100 text-orange-800",
  HIGHLY_RESTRICTED: "bg-red-100 text-red-800",
};

export default function SafeguardingPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"notes" | "audit">("notes");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    title: "",
    content: "",
    category: "CONCERN",
    severity: "MEDIUM",
    confidentialityLevel: "STANDARD",
    reportedDate: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await getSafeguardingNotes({ reason: "Viewing safeguarding dashboard" });
      setNotes(res.data || []);
    } catch {
      setNotes([]);
    }
    setLoading(false);
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await getSafeguardingAccessLogs();
      setAuditLogs(res.data || []);
    } catch {
      setAuditLogs([]);
    }
    setAuditLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    if (activeTab === "audit" && (isAdmin || isSuperAdmin)) {
      loadAuditLogs();
    }
  }, [activeTab, isAdmin, isSuperAdmin]);

  const handleCreate = async () => {
    if (!form.studentId || !form.title || !form.content || !form.reason) return;
    try {
      await createSafeguardingNote(form);
      setForm({
        studentId: "",
        title: "",
        content: "",
        category: "CONCERN",
        severity: "MEDIUM",
        confidentialityLevel: "STANDARD",
        reportedDate: new Date().toISOString().split("T")[0],
        reason: "",
      });
      setShowForm(false);
      loadNotes();
    } catch (err: any) {
      alert(err.message || "Failed to create safeguarding note");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Safeguarding</h1>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "notes" ? "default" : "outline"}
            onClick={() => setActiveTab("notes")}
          >
            Notes
          </Button>
          {(isAdmin || isSuperAdmin) && (
            <Button
              variant={activeTab === "audit" ? "default" : "outline"}
              onClick={() => setActiveTab("audit")}
            >
              Audit Log
            </Button>
          )}
        </div>
      </div>

      {activeTab === "notes" ? (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "New Note"}
            </Button>
          </div>

          {showForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Student ID *"
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                />
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Title *"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <textarea
                  className="w-full border rounded px-3 py-2 min-h-[100px]"
                  placeholder="Content *"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
                <div className="flex gap-4">
                  <select
                    className="flex-1 border rounded px-3 py-2"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="CONCERN">Concern</option>
                    <option value="INCIDENT">Incident</option>
                    <option value="DISCLOSURE">Disclosure</option>
                    <option value="MEDICAL">Medical</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <select
                    className="flex-1 border rounded px-3 py-2"
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  <select
                    className="flex-1 border rounded px-3 py-2"
                    value={form.confidentialityLevel}
                    onChange={(e) => setForm({ ...form, confidentialityLevel: e.target.value })}
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="RESTRICTED">Restricted</option>
                    {isSuperAdmin && <option value="HIGHLY_RESTRICTED">Highly Restricted</option>}
                  </select>
                </div>
                <div className="flex gap-4">
                  <input
                    type="date"
                    className="flex-1 border rounded px-3 py-2"
                    value={form.reportedDate}
                    onChange={(e) => setForm({ ...form, reportedDate: e.target.value })}
                  />
                  <input
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="Reason for creating this note *"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </div>
                <Button onClick={handleCreate}>Create Note</Button>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : notes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No safeguarding notes found.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidentiality</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {notes.map((n: any) => (
                    <tr key={n.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{n.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{n.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={severityColors[n.severity] || ""}>{n.severity}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={statusColors[n.status] || ""}>{n.status}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={confidentialityColors[n.confidentialityLevel] || ""}>{n.confidentialityLevel}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{n.reportedDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {auditLoading ? (
            <p className="text-gray-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No audit log entries found.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.accessTimestamp ? new Date(log.accessTimestamp).toLocaleString() : "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {log.userName || log.userEmail || log.userId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="outline">{log.accessType}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.noteTitle || log.noteId || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {log.reasonForAccess || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {log.ipAddress || "—"}
                      </td>
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
