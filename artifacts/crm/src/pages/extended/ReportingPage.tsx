import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { getReportTypes, executeReport, getSavedReports, createSavedReport, updateSavedReport, deleteSavedReport, getDashboards, createDashboard, updateDashboard, deleteDashboard, generateEvidencePack } from "../../lib/api";

export default function ReportingPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"browse" | "builder" | "saved" | "dashboards">("browse");
  const [reportTypes, setReportTypes] = useState<any[]>([]);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  
  // Builder state
  const [selectedReportType, setSelectedReportType] = useState<any>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<any[]>([]);
  const [sortOrder, setSortOrder] = useState<any[]>([]);
  const [reportName, setReportName] = useState("");
  const [chartType, setChartType] = useState("");
  const [sharing, setSharing] = useState("PRIVATE");
  
  // Saved report edit
  const [editingSavedReport, setEditingSavedReport] = useState<any>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  
  // Dashboard state
  const [showDashboardDialog, setShowDashboardDialog] = useState(false);
  const [dashboardName, setDashboardName] = useState("");
  const [dashboardDescription, setDashboardDescription] = useState("");
  const [editingDashboard, setEditingDashboard] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [typesRes, savedRes, dashRes] = await Promise.all([
        getReportTypes(),
        getSavedReports(),
        getDashboards(),
      ]);
      setReportTypes(typesRes.data || []);
      setSavedReports(savedRes.data || []);
      setDashboards(dashRes.data || []);
    } catch {
      setReportTypes([]);
      setSavedReports([]);
      setDashboards([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSelectReportType = (reportType: any) => {
    setSelectedReportType(reportType);
    setSelectedColumns(reportType.availableFields || []);
    setFilters([]);
    setSortOrder([]);
    setActiveTab("builder");
  };

  const handleExecuteReport = async () => {
    if (!selectedReportType) return;
    setReportLoading(true);
    try {
      const res = await executeReport({
        reportTypeId: selectedReportType.id,
        columns: selectedColumns,
        filters,
        sortOrder,
        page: reportPage,
        limit: 50,
      });
      setReportData(res.data || []);
      setReportTotal(res.total || 0);
    } catch (err: any) {
      alert(err.message || "Failed to execute report");
      setReportData([]);
    }
    setReportLoading(false);
  };

  const handleSaveReport = async () => {
    if (!reportName || !selectedReportType) return;
    try {
      if (editingSavedReport) {
        await updateSavedReport(editingSavedReport.id, {
          name: reportName,
          columns: selectedColumns,
          filters,
          sortOrder,
          chartType,
          sharing,
        });
      } else {
        await createSavedReport({
          reportTypeId: selectedReportType.id,
          name: reportName,
          columns: selectedColumns,
          filters,
          sortOrder,
          chartType,
          sharing,
        });
      }
      resetBuilder();
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to save report");
    }
  };

  const handleLoadSavedReport = async (report: any) => {
    setSelectedReportType(reportTypes.find((t) => t.id === report.reportTypeId) || null);
    setSelectedColumns(report.columns || []);
    setFilters(report.filters || []);
    setSortOrder(report.sortOrder || []);
    setReportName(report.name);
    setChartType(report.chartType || "");
    setSharing(report.sharing || "PRIVATE");
    setEditingSavedReport(report);
    setActiveTab("builder");
  };

  const handleDeleteSavedReport = async (reportId: string) => {
    if (confirm("Delete this saved report?")) {
      try {
        await deleteSavedReport(reportId);
        loadData();
      } catch (err: any) {
        alert(err.message || "Failed to delete report");
      }
    }
  };

  const handleExportCsv = async (reportId: string) => {
    try {
      const response = await fetch(`/api/reports/saved/${reportId}/export/csv`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report_${reportId}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(err.message || "Failed to export CSV");
    }
  };

  const handleSaveDashboard = async () => {
    if (!dashboardName) return;
    try {
      if (editingDashboard) {
        await updateDashboard(editingDashboard.id, { name: dashboardName, description: dashboardDescription });
      } else {
        await createDashboard({ name: dashboardName, description: dashboardDescription, layout: [] });
      }
      setDashboardName("");
      setDashboardDescription("");
      setEditingDashboard(null);
      setShowDashboardDialog(false);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to save dashboard");
    }
  };

  const handleDeleteDashboard = async (dashboardId: string) => {
    if (confirm("Delete this dashboard?")) {
      try {
        await deleteDashboard(dashboardId);
        loadData();
      } catch (err: any) {
        alert(err.message || "Failed to delete dashboard");
      }
    }
  };

  const handleGenerateEvidencePack = async () => {
    const fundingOpportunityId = prompt("Enter Funding Opportunity ID:");
    if (fundingOpportunityId) {
      try {
        const blob = await generateEvidencePack(fundingOpportunityId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evidence-pack-${fundingOpportunityId}.json.gz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        alert(err.message || "Failed to generate evidence pack");
      }
    }
  };

  const resetBuilder = () => {
    setSelectedReportType(null);
    setSelectedColumns([]);
    setFilters([]);
    setSortOrder([]);
    setReportName("");
    setChartType("");
    setSharing("PRIVATE");
    setEditingSavedReport(null);
    setShowSaveDialog(false);
    setReportData([]);
    setReportTotal(0);
    setReportPage(1);
  };

  const addFilter = () => {
    if (!selectedReportType) return;
    setFilters([...filters, { field: "", operator: "equals", value: "" }]);
  };

  const updateFilter = (index: number, field: string, value: any) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Reporting Engine</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateEvidencePack}>Generate Evidence Pack</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse">Report Browser</TabsTrigger>
          <TabsTrigger value="builder">Report Builder</TabsTrigger>
          <TabsTrigger value="saved">Saved Reports</TabsTrigger>
          <TabsTrigger value="dashboards">Dashboards</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <Card>
            <CardHeader><CardTitle>Available Report Types</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p>Loading report types...</p> : reportTypes.length === 0 ? (
                <p>No report types available. Enable the reports module to access reporting.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportTypes.map((rt) => (
                    <Card key={rt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleSelectReportType(rt)}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{rt.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600 mb-2">{rt.description}</p>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary">{rt.entityType}</Badge>
                          <Badge variant="outline">{(rt.availableFields || []).length} fields</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builder">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingSavedReport ? "Edit Report" : "Report Builder"}</CardTitle>
              <div className="flex gap-2">
                {reportData.length > 0 && (
                  <Button variant="outline" onClick={() => setShowSaveDialog(true)}>Save Report</Button>
                )}
                <Button variant="outline" onClick={resetBuilder}>Reset</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedReportType ? (
                <p className="text-gray-500">Select a report type from the Report Browser to begin building.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">{selectedReportType.label}</h3>
                    <p className="text-sm text-gray-600">{selectedReportType.description}</p>
                  </div>

                  {/* Column Selection */}
                  <div>
                    <h4 className="font-medium mb-2">Columns</h4>
                    <div className="flex flex-wrap gap-2">
                      {(selectedReportType.availableFields || []).map((field: string) => (
                        <Badge
                          key={field}
                          className={`cursor-pointer ${selectedColumns.includes(field) ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}
                          onClick={() => toggleColumn(field)}
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Filters */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium">Filters</h4>
                      <Button variant="outline" size="sm" onClick={addFilter}>Add Filter</Button>
                    </div>
                    {filters.map((filter, index) => (
                      <div key={index} className="flex gap-2 mb-2 items-center">
                        <Select value={filter.field} onValueChange={(val) => updateFilter(index, "field", val)}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="Field" /></SelectTrigger>
                          <SelectContent>
                            {(selectedReportType.availableFields || []).map((field: string) => (
                              <SelectItem key={field} value={field}>{field}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={filter.operator} onValueChange={(val) => updateFilter(index, "operator", val)}>
                          <SelectTrigger className="w-36"><SelectValue placeholder="Condition" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="starts_with">Starts With</SelectItem>
                            <SelectItem value="in_list">In List</SelectItem>
                            <SelectItem value="null">Is Null</SelectItem>
                            <SelectItem value="not_null">Not Null</SelectItem>
                            <SelectItem value="date_range">Date Range</SelectItem>
                            <SelectItem value="gte">Greater Than</SelectItem>
                            <SelectItem value="lte">Less Than</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={filter.value}
                          onChange={(e) => updateFilter(index, "value", e.target.value)}
                          placeholder="Value"
                          className="w-48"
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeFilter(index)}>×</Button>
                      </div>
                    ))}
                  </div>

                  {/* Execute Button */}
                  <Button onClick={handleExecuteReport} disabled={reportLoading || selectedColumns.length === 0}>
                    {reportLoading ? "Running..." : "Run Report"}
                  </Button>

                  {/* Results */}
                  {reportData.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">Results ({reportTotal} total)</h4>
                      </div>
                      <div className="border rounded-md overflow-auto max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {selectedColumns.map((col) => (
                                <TableHead key={col}>{col}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.map((row, idx) => (
                              <TableRow key={idx}>
                                {selectedColumns.map((col) => (
                                  <TableCell key={col}>{row[col] ?? "—"}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-sm text-gray-600">Page {reportPage} of {Math.ceil(reportTotal / 50)}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled={reportPage <= 1} onClick={() => { setReportPage(reportPage - 1); handleExecuteReport(); }}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={reportPage >= Math.ceil(reportTotal / 50)} onClick={() => { setReportPage(reportPage + 1); handleExecuteReport(); }}>Next</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saved">
          <Card>
            <CardHeader><CardTitle>Saved Reports</CardTitle></CardHeader>
            <CardContent>
              {savedReports.length === 0 ? (
                <p>No saved reports. Build and save a report from the Report Builder.</p>
              ) : (
                <div className="space-y-4">
                  {savedReports.map((report) => (
                    <Card key={report.id}>
                      <CardContent className="flex justify-between items-center py-4">
                        <div>
                          <h3 className="font-medium">{report.name}</h3>
                          <p className="text-sm text-gray-600">
                            {report.sharing} • Updated {new Date(report.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleLoadSavedReport(report)}>Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => handleExportCsv(report.id)}>Export CSV</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedReport(report.id)}>Delete</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboards">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Dashboards</CardTitle>
              <Button onClick={() => { setEditingDashboard(null); setDashboardName(""); setDashboardDescription(""); setShowDashboardDialog(true); }}>New Dashboard</Button>
            </CardHeader>
            <CardContent>
              {dashboards.length === 0 ? (
                <p>No dashboards created yet. Create your first dashboard to organize reports.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboards.map((dash) => (
                    <Card key={dash.id}>
                      <CardContent className="py-4">
                        <h3 className="font-medium">{dash.name}</h3>
                        <p className="text-sm text-gray-600 mb-2">{dash.description}</p>
                        <Badge variant="secondary">{dash.sharing}</Badge>
                        <div className="flex gap-2 mt-2">
                          <Button variant="outline" size="sm" onClick={() => { setEditingDashboard(dash); setDashboardName(dash.name); setDashboardDescription(dash.description || ""); setShowDashboardDialog(true); }}>Edit</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteDashboard(dash.id)}>Delete</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Report Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSavedReport ? "Update Report" : "Save Report"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Report Name</Label>
              <Input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="My Report" />
            </div>
            <div>
              <Label>Chart Type (optional)</Label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sharing</Label>
              <Select value={sharing} onValueChange={setSharing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="ROLE">Team</SelectItem>
                  <SelectItem value="ALL">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveReport}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dashboard Dialog */}
      <Dialog open={showDashboardDialog} onOpenChange={setShowDashboardDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDashboard ? "Edit Dashboard" : "New Dashboard"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Dashboard Name</Label>
              <Input value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} placeholder="My Dashboard" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={dashboardDescription} onChange={(e) => setDashboardDescription(e.target.value)} placeholder="Dashboard description" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDashboardDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveDashboard}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
