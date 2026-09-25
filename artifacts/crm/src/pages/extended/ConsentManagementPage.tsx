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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { getConsentRecords, createConsentRecord, updateConsentRecord, withdrawConsentRecord, getConsentDashboardStatus, getParentGuardians, createParentGuardian, updateParentGuardian } from "../../lib/api";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  OBTAINED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  WITHDRAWN: "bg-red-100 text-red-800",
  REVOKED: "bg-red-100 text-red-800",
};

const consentTypeLabels: Record<string, string> = {
  PROGRAMME_PARTICIPATION: "Programme Participation",
  PHOTOGRAPHY: "Photography",
  DATA_SHARING: "Data Sharing",
  MEDICAL: "Medical",
  TRANSPORT: "Transport",
  OTHER: "Other",
};

const consentScopeLabels: Record<string, string> = {
  SINGLE_PROGRAMME: "Single Programme",
  ALL_PROGRAMMES: "All Programmes",
  ORGANIZATION_WIDE: "Organization Wide",
};

const obtainedMethodLabels: Record<string, string> = {
  PAPER_FORM: "Paper Form",
  DIGITAL_FORM: "Digital Form",
  VERBAL: "Verbal",
  EMAIL: "Email",
  OTHER: "Other",
};

const relationshipTypeLabels: Record<string, string> = {
  PARENT: "Parent",
  GUARDIAN: "Guardian",
  GRANDPARENT: "Grandparent",
  SIBLING: "Sibling",
  OTHER: "Other",
};

const contactMethodLabels: Record<string, string> = {
  EMAIL: "Email",
  PHONE_MOBILE: "Mobile Phone",
  PHONE_HOME: "Home Phone",
  PHONE_WORK: "Work Phone",
  POST: "Post",
};

export default function ConsentManagementPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "consents" | "guardians">("dashboard");
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  
  // Form states
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [editingConsent, setEditingConsent] = useState<any>(null);
  const [editingGuardian, setEditingGuardian] = useState<any>(null);

  const [consentForm, setConsentForm] = useState({
    studentId: "",
    parentGuardianId: "",
    consentType: "PROGRAMME_PARTICIPATION",
    consentScope: "SINGLE_PROGRAMME",
    programmeId: "",
    status: "PENDING",
    obtainedDate: new Date().toISOString().split("T")[0],
    obtainedByUserId: "",
    obtainedMethod: "DIGITAL_FORM",
    expiryDate: "",
    documentUrl: "",
    notes: "",
  });

  const [guardianForm, setGuardianForm] = useState({
    studentId: "",
    firstName: "",
    lastName: "",
    relationship: "PARENT",
    isPrimaryContact: false,
    isEmergencyContact: false,
    email: "",
    phoneMobile: "",
    phoneHome: "",
    phoneWork: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    preferredContactMethod: "EMAIL",
    preferredContactTime: "",
    notes: "",
  });

  const loadConsents = async () => {
    setLoading(true);
    try {
      const res = await getConsentRecords();
      setConsents(res.data || []);
    } catch {
      setConsents([]);
    }
    setLoading(false);
  };

  const loadDashboardStats = async () => {
    try {
      const res = await getConsentDashboardStatus();
      setDashboardStats(res);
    } catch {
      setDashboardStats(null);
    }
  };

  const loadGuardians = async () => {
    setGuardiansLoading(true);
    try {
      const res = await getParentGuardians();
      setGuardians(res.data || []);
    } catch {
      setGuardians([]);
    }
    setGuardiansLoading(false);
  };

  useEffect(() => {
    loadConsents();
    loadDashboardStats();
  }, []);

  useEffect(() => {
    if (activeTab === "guardians") {
      loadGuardians();
    }
  }, [activeTab]);

  const handleCreateConsent = async () => {
    try {
      if (editingConsent) {
        await updateConsentRecord(editingConsent.id, consentForm);
      } else {
        await createConsentRecord(consentForm);
      }
      resetConsentForm();
      loadConsents();
    } catch (err: any) {
      alert(err.message || "Failed to save consent record");
    }
  };

  const handleWithdrawConsent = async (consentId: string) => {
    const reason = prompt("Please provide a reason for withdrawing this consent:");
    if (reason) {
      try {
        await withdrawConsentRecord(consentId, reason);
        loadConsents();
      } catch (err: any) {
        alert(err.message || "Failed to withdraw consent");
      }
    }
  };

  const handleCreateGuardian = async () => {
    try {
      if (editingGuardian) {
        await updateParentGuardian(editingGuardian.id, guardianForm);
      } else {
        await createParentGuardian(guardianForm);
      }
      resetGuardianForm();
      loadGuardians();
    } catch (err: any) {
      alert(err.message || "Failed to save parent/guardian record");
    }
  };

  const resetConsentForm = () => {
    setConsentForm({
      studentId: "",
      parentGuardianId: "",
      consentType: "PROGRAMME_PARTICIPATION",
      consentScope: "SINGLE_PROGRAMME",
      programmeId: "",
      status: "PENDING",
      obtainedDate: new Date().toISOString().split("T")[0],
      obtainedByUserId: "",
      obtainedMethod: "DIGITAL_FORM",
      expiryDate: "",
      documentUrl: "",
      notes: "",
    });
    setEditingConsent(null);
    setShowConsentForm(false);
  };

  const resetGuardianForm = () => {
    setGuardianForm({
      studentId: "",
      firstName: "",
      lastName: "",
      relationship: "PARENT",
      isPrimaryContact: false,
      isEmergencyContact: false,
      email: "",
      phoneMobile: "",
      phoneHome: "",
      phoneWork: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      preferredContactMethod: "EMAIL",
      preferredContactTime: "",
      notes: "",
    });
    setEditingGuardian(null);
    setShowGuardianForm(false);
  };

  const editConsent = (consent: any) => {
    setConsentForm({
      studentId: consent.studentId,
      parentGuardianId: consent.parentGuardianId || "",
      consentType: consent.consentType,
      consentScope: consent.consentScope,
      programmeId: consent.programmeId || "",
      status: consent.status,
      obtainedDate: consent.obtainedDate || new Date().toISOString().split("T")[0],
      obtainedByUserId: consent.obtainedByUserId || "",
      obtainedMethod: consent.obtainedMethod || "DIGITAL_FORM",
      expiryDate: consent.expiryDate || "",
      documentUrl: consent.documentUrl || "",
      notes: consent.notes || "",
    });
    setEditingConsent(consent);
    setShowConsentForm(true);
  };

  const editGuardian = (guardian: any) => {
    setGuardianForm({
      studentId: guardian.studentId,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      relationship: guardian.relationship,
      isPrimaryContact: guardian.isPrimaryContact,
      isEmergencyContact: guardian.isEmergencyContact,
      email: guardian.email || "",
      phoneMobile: guardian.phoneMobile || "",
      phoneHome: guardian.phoneHome || "",
      phoneWork: guardian.phoneWork || "",
      addressLine1: guardian.addressLine1 || "",
      addressLine2: guardian.addressLine2 || "",
      city: guardian.city || "",
      postcode: guardian.postcode || "",
      preferredContactMethod: guardian.preferredContactMethod || "EMAIL",
      preferredContactTime: guardian.preferredContactTime || "",
      notes: guardian.notes || "",
    });
    setEditingGuardian(guardian);
    setShowGuardianForm(true);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Consent Management</h1>
      
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="consents">Consent Records</TabsTrigger>
          <TabsTrigger value="guardians">Parent/Guardians</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle>Consent Status Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardStats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Consents</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.total}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.pending}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.expiringSoon}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Expired</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.expired}</div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p>Loading dashboard statistics...</p>
              )}
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Consent Types</h3>
                {dashboardStats?.byConsentType && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dashboardStats.byConsentType).map(([type, count]: [string, number]) => (
                      <Badge key={type} variant="secondary">
                        {consentTypeLabels[type] || type}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Status Distribution</h3>
                {dashboardStats?.byStatus && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dashboardStats.byStatus).map(([status, count]: [string, number]) => (
                      <Badge key={status} className={statusColors[status] || "bg-gray-100 text-gray-800"}>
                        {status}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Consent Records</CardTitle>
              {(isAdmin || isSuperAdmin) && (
                <Button onClick={() => {
                  resetConsentForm();
                  setShowConsentForm(true);
                }}>
                  Add Consent Record
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>Loading consent records...</p>
              ) : consents.length === 0 ? (
                <p>No consent records found.</p>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Obtained Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consents.map((consent) => (
                        <TableRow key={consent.id}>
                          <TableCell>{consent.studentId}</TableCell>
                          <TableCell>{consentTypeLabels[consent.consentType] || consent.consentType}</TableCell>
                          <TableCell>{consentScopeLabels[consent.consentScope] || consent.consentScope}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[consent.status] || "bg-gray-100 text-gray-800"}>
                              {consent.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{consent.obtainedDate || "N/A"}</TableCell>
                          <TableCell>{consent.expiryDate || "N/A"}</TableCell>
                          <TableCell className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => editConsent(consent)}>
                              Edit
                            </Button>
                            {consent.status === "OBTAINED" && (
                              <Button variant="destructive" size="sm" onClick={() => handleWithdrawConsent(consent.id)}>
                                Withdraw
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guardians">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Parent/Guardian Records</CardTitle>
              {(isAdmin || isSuperAdmin) && (
                <Button onClick={() => {
                  resetGuardianForm();
                  setShowGuardianForm(true);
                }}>
                  Add Parent/Guardian
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {guardiansLoading ? (
                <p>Loading parent/guardian records...</p>
              ) : guardians.length === 0 ? (
                <p>No parent/guardian records found.</p>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Primary Contact</TableHead>
                        <TableHead>Emergency Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guardians.map((guardian) => (
                        <TableRow key={guardian.id}>
                          <TableCell>{guardian.studentId}</TableCell>
                          <TableCell>{guardian.firstName} {guardian.lastName}</TableCell>
                          <TableCell>{relationshipTypeLabels[guardian.relationship] || guardian.relationship}</TableCell>
                          <TableCell>{guardian.isPrimaryContact ? "Yes" : "No"}</TableCell>
                          <TableCell>{guardian.isEmergencyContact ? "Yes" : "No"}</TableCell>
                          <TableCell>{guardian.email || "N/A"}</TableCell>
                          <TableCell>{guardian.phoneMobile || guardian.phoneHome || "N/A"}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => editGuardian(guardian)}>
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Consent Form Dialog */}
      <Dialog open={showConsentForm} onOpenChange={setShowConsentForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingConsent ? "Edit Consent Record" : "Add Consent Record"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={consentForm.studentId}
                onChange={(e) => setConsentForm({...consentForm, studentId: e.target.value})}
                placeholder="Student ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentGuardianId">Parent/Guardian ID (optional)</Label>
              <Input
                id="parentGuardianId"
                value={consentForm.parentGuardianId}
                onChange={(e) => setConsentForm({...consentForm, parentGuardianId: e.target.value})}
                placeholder="Parent/Guardian ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consentType">Consent Type</Label>
              <Select value={consentForm.consentType} onValueChange={(val) => setConsentForm({...consentForm, consentType: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select consent type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(consentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="consentScope">Consent Scope</Label>
              <Select value={consentForm.consentScope} onValueChange={(val) => setConsentForm({...consentForm, consentScope: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select consent scope" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(consentScopeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="programmeId">Programme ID (optional)</Label>
              <Input
                id="programmeId"
                value={consentForm.programmeId}
                onChange={(e) => setConsentForm({...consentForm, programmeId: e.target.value})}
                placeholder="Programme ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={consentForm.status} onValueChange={(val) => setConsentForm({...consentForm, status: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(statusColors).map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="obtainedDate">Obtained Date</Label>
              <Input
                id="obtainedDate"
                type="date"
                value={consentForm.obtainedDate}
                onChange={(e) => setConsentForm({...consentForm, obtainedDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date (optional)</Label>
              <Input
                id="expiryDate"
                type="date"
                value={consentForm.expiryDate}
                onChange={(e) => setConsentForm({...consentForm, expiryDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="obtainedMethod">Obtained Method</Label>
              <Select value={consentForm.obtainedMethod} onValueChange={(val) => setConsentForm({...consentForm, obtainedMethod: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(obtainedMethodLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="documentUrl">Document URL (optional)</Label>
              <Input
                id="documentUrl"
                value={consentForm.documentUrl}
                onChange={(e) => setConsentForm({...consentForm, documentUrl: e.target.value})}
                placeholder="URL to consent document"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={consentForm.notes}
                onChange={(e) => setConsentForm({...consentForm, notes: e.target.value})}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetConsentForm}>Cancel</Button>
            <Button onClick={handleCreateConsent}>Save Consent</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guardian Form Dialog */}
      <Dialog open={showGuardianForm} onOpenChange={setShowGuardianForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingGuardian ? "Edit Parent/Guardian" : "Add Parent/Guardian"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={guardianForm.studentId}
                onChange={(e) => setGuardianForm({...guardianForm, studentId: e.target.value})}
                placeholder="Student ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={guardianForm.firstName}
                onChange={(e) => setGuardianForm({...guardianForm, firstName: e.target.value})}
                placeholder="First Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={guardianForm.lastName}
                onChange={(e) => setGuardianForm({...guardianForm, lastName: e.target.value})}
                placeholder="Last Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Select value={guardianForm.relationship} onValueChange={(val) => setGuardianForm({...guardianForm, relationship: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(relationshipTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isPrimaryContact">Primary Contact</Label>
              <Select value={guardianForm.isPrimaryContact ? "true" : "false"} 
                      onValueChange={(val) => setGuardianForm({...guardianForm, isPrimaryContact: val === "true"})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isEmergencyContact">Emergency Contact</Label>
              <Select value={guardianForm.isEmergencyContact ? "true" : "false"} 
                      onValueChange={(val) => setGuardianForm({...guardianForm, isEmergencyContact: val === "true"})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={guardianForm.email}
                onChange={(e) => setGuardianForm({...guardianForm, email: e.target.value})}
                placeholder="Email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneMobile">Mobile Phone</Label>
              <Input
                id="phoneMobile"
                value={guardianForm.phoneMobile}
                onChange={(e) => setGuardianForm({...guardianForm, phoneMobile: e.target.value})}
                placeholder="Mobile Phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneHome">Home Phone</Label>
              <Input
                id="phoneHome"
                value={guardianForm.phoneHome}
                onChange={(e) => setGuardianForm({...guardianForm, phoneHome: e.target.value})}
                placeholder="Home Phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneWork">Work Phone</Label>
              <Input
                id="phoneWork"
                value={guardianForm.phoneWork}
                onChange={(e) => setGuardianForm({...guardianForm, phoneWork: e.target.value})}
                placeholder="Work Phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input
                id="addressLine1"
                value={guardianForm.addressLine1}
                onChange={(e) => setGuardianForm({...guardianForm, addressLine1: e.target.value})}
                placeholder="Address Line 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                value={guardianForm.addressLine2}
                onChange={(e) => setGuardianForm({...guardianForm, addressLine2: e.target.value})}
                placeholder="Address Line 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={guardianForm.city}
                onChange={(e) => setGuardianForm({...guardianForm, city: e.target.value})}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={guardianForm.postcode}
                onChange={(e) => setGuardianForm({...guardianForm, postcode: e.target.value})}
                placeholder="Postcode"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredContactMethod">Preferred Contact Method</Label>
              <Select value={guardianForm.preferredContactMethod} onValueChange={(val) => setGuardianForm({...guardianForm, preferredContactMethod: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contactMethodLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredContactTime">Preferred Contact Time</Label>
              <Input
                id="preferredContactTime"
                value={guardianForm.preferredContactTime}
                onChange={(e) => setGuardianForm({...guardianForm, preferredContactTime: e.target.value})}
                placeholder="e.g., Weekday mornings"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={guardianForm.notes}
                onChange={(e) => setGuardianForm({...guardianForm, notes: e.target.value})}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetGuardianForm}>Cancel</Button>
            <Button onClick={handleCreateGuardian}>Save Guardian</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}