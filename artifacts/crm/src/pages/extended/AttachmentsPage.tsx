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
import { getAttachments, uploadAttachment, deleteAttachment, getEntityAttachments, getAttachmentsDashboardStats, updateAttachmentMetadata } from "../../lib/api";

const categoryLabels: Record<string, string> = {
  DOCUMENT: "Document",
  IMAGE: "Image",
  AUDIO: "Audio",
  VIDEO: "Video",
  ARCHIVE: "Archive",
  OTHER: "Other",
};

const storageProviderLabels: Record<string, string> = {
  LOCAL: "Local",
  S3: "Amazon S3",
  AZURE_BLOB: "Azure Blob",
  GOOGLE_CLOUD_STORAGE: "Google Cloud Storage",
};

const entityTypeOptions = [
  { value: "organizations", label: "Organization" },
  { value: "contacts", label: "Contact" },
  { value: "students", label: "Student" },
  { value: "programmes", label: "Programme" },
  { value: "consent_records", label: "Consent Record" },
  { value: "safeguarding_notes", label: "Safeguarding Note" },
  { value: "activities", label: "Activity" },
];

export default function AttachmentsPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "all" | "upload">("dashboard");
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [entityAttachments, setEntityAttachments] = useState<any[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  
  // Form states
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<any>(null);

  const [uploadForm, setUploadForm] = useState({
    entityType: "students",
    entityId: "",
    category: "DOCUMENT",
    description: "",
    isPublic: false,
  });

  const [metadataForm, setMetadataForm] = useState({
    description: "",
    isPublic: false,
    category: "DOCUMENT",
  });

  const [entityFilter, setEntityFilter] = useState({
    entityType: "students",
    entityId: "",
  });

  const loadAttachments = async () => {
    setLoading(true);
    try {
      const res = await getAttachments();
      setAttachments(res.data || []);
    } catch {
      setAttachments([]);
    }
    setLoading(false);
  };

  const loadDashboardStats = async () => {
    try {
      const res = await getAttachmentsDashboardStats();
      setDashboardStats(res);
    } catch {
      setDashboardStats(null);
    }
  };

  const loadEntityAttachments = async () => {
    if (!entityFilter.entityId) return;
    setEntityLoading(true);
    try {
      const res = await getEntityAttachments(entityFilter.entityType, entityFilter.entityId);
      setEntityAttachments(res.data || []);
    } catch {
      setEntityAttachments([]);
    }
    setEntityLoading(false);
  };

  useEffect(() => {
    loadAttachments();
    loadDashboardStats();
  }, []);

  useEffect(() => {
    if (activeTab === "all") {
      loadAttachments();
    }
  }, [activeTab]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      alert("Please select a file to upload");
      return;
    }

    formData.append('file', fileInput.files[0]);
    formData.append('entityType', uploadForm.entityType);
    formData.append('entityId', uploadForm.entityId);
    formData.append('category', uploadForm.category);
    formData.append('description', uploadForm.description);
    formData.append('isPublic', uploadForm.isPublic.toString());

    try {
      await uploadAttachment(formData);
      resetUploadForm();
      loadAttachments();
      if (entityFilter.entityType === uploadForm.entityType && entityFilter.entityId === uploadForm.entityId) {
        loadEntityAttachments();
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload attachment");
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (confirm("Are you sure you want to delete this attachment?")) {
      try {
        await deleteAttachment(attachmentId);
        loadAttachments();
        loadEntityAttachments();
      } catch (err: any) {
        alert(err.message || "Failed to delete attachment");
      }
    }
  };

  const handleUpdateMetadata = async () => {
    if (!editingAttachment) return;
    
    try {
      await updateAttachmentMetadata(editingAttachment.id, metadataForm);
      resetMetadataForm();
      loadAttachments();
      loadEntityAttachments();
    } catch (err: any) {
      alert(err.message || "Failed to update attachment metadata");
    }
  };

  const resetUploadForm = () => {
    setUploadForm({
      entityType: "students",
      entityId: "",
      category: "DOCUMENT",
      description: "",
      isPublic: false,
    });
    setShowUploadForm(false);
    // Reset file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const resetMetadataForm = () => {
    setMetadataForm({
      description: "",
      isPublic: false,
      category: "DOCUMENT",
    });
    setEditingAttachment(null);
    setShowMetadataForm(false);
  };

  const editMetadata = (attachment: any) => {
    setMetadataForm({
      description: attachment.description || "",
      isPublic: attachment.isPublic || false,
      category: attachment.category || "DOCUMENT",
    });
    setEditingAttachment(attachment);
    setShowMetadataForm(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Attachments Management</h1>
      
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="all">All Attachments</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle>Attachments Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardStats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Attachments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.total}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{dashboardStats.totalSizeMB} MB</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{Object.keys(dashboardStats.byCategory).length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Entity Types</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{Object.keys(dashboardStats.byEntityType).length}</div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p>Loading statistics...</p>
              )}
              
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">By Category</h3>
                  {dashboardStats?.byCategory && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(dashboardStats.byCategory).map(([category, count]: [string, number]) => (
                        <Badge key={category} variant="secondary">
                          {categoryLabels[category] || category}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">By Entity Type</h3>
                  {dashboardStats?.byEntityType && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(dashboardStats.byEntityType).map(([entityType, count]: [string, number]) => (
                        <Badge key={entityType} variant="secondary">
                          {entityType}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Entity Attachment Browser</h3>
                <div className="flex gap-2 mb-4">
                  <Select value={entityFilter.entityType} onValueChange={(val) => setEntityFilter({...entityFilter, entityType: val})}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {entityTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={entityFilter.entityId}
                    onChange={(e) => setEntityFilter({...entityFilter, entityId: e.target.value})}
                    placeholder="Entity ID"
                    className="w-[200px]"
                  />
                  <Button onClick={loadEntityAttachments} disabled={!entityFilter.entityId || entityLoading}>
                    {entityLoading ? "Loading..." : "Load Attachments"}
                  </Button>
                </div>
                
                {entityAttachments.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Filename</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Uploaded</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entityAttachments.map((attachment) => (
                          <TableRow key={attachment.id}>
                            <TableCell>{attachment.fileName}</TableCell>
                            <TableCell>{attachment.fileType}</TableCell>
                            <TableCell>{formatFileSize(attachment.fileSize)}</TableCell>
                            <TableCell>{categoryLabels[attachment.category] || attachment.category}</TableCell>
                            <TableCell>{new Date(attachment.uploadedAt).toLocaleString()}</TableCell>
                            <TableCell className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => editMetadata(attachment)}>
                                Edit
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(attachment.id)}>
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p>No attachments found for this entity.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>All Attachments</CardTitle>
              <Button onClick={() => setActiveTab("upload")}>Upload New Attachment</Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>Loading attachments...</p>
              ) : attachments.length === 0 ? (
                <p>No attachments found.</p>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filename</TableHead>
                        <TableHead>Entity Type</TableHead>
                        <TableHead>Entity ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attachments.map((attachment) => (
                        <TableRow key={attachment.id}>
                          <TableCell>{attachment.fileName}</TableCell>
                          <TableCell>{attachment.entityType}</TableCell>
                          <TableCell>{attachment.entityId}</TableCell>
                          <TableCell>{attachment.fileType}</TableCell>
                          <TableCell>{formatFileSize(attachment.fileSize)}</TableCell>
                          <TableCell>{categoryLabels[attachment.category] || attachment.category}</TableCell>
                          <TableCell>{storageProviderLabels[attachment.storageProvider] || attachment.storageProvider}</TableCell>
                          <TableCell>{new Date(attachment.uploadedAt).toLocaleString()}</TableCell>
                          <TableCell className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => editMetadata(attachment)}>
                              Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(attachment.id)}>
                              Delete
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

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload New Attachment</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entityType">Entity Type</Label>
                    <Select value={uploadForm.entityType} onValueChange={(val) => setUploadForm({...uploadForm, entityType: val})} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select entity type" />
                      </SelectTrigger>
                      <SelectContent>
                        {entityTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entityId">Entity ID</Label>
                    <Input
                      id="entityId"
                      value={uploadForm.entityId}
                      onChange={(e) => setUploadForm({...uploadForm, entityId: e.target.value})}
                      placeholder="Entity ID"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={uploadForm.category} onValueChange={(val) => setUploadForm({...uploadForm, category: val})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="isPublic">Access</Label>
                    <Select value={uploadForm.isPublic ? "true" : "false"} onValueChange={(val) => setUploadForm({...uploadForm, isPublic: val === "true"})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select access level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Public</SelectItem>
                        <SelectItem value="false">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      value={uploadForm.description}
                      onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})}
                      placeholder="Description of the attachment"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="file-upload">File</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".*"
                      required
                    />
                    <p className="text-sm text-gray-500">Max file size: 10MB</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" type="button" onClick={resetUploadForm}>Cancel</Button>
                  <Button type="submit">Upload Attachment</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Metadata Edit Dialog */}
      <Dialog open={showMetadataForm} onOpenChange={setShowMetadataForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Attachment Metadata</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={metadataForm.description}
                onChange={(e) => setMetadataForm({...metadataForm, description: e.target.value})}
                placeholder="Description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={metadataForm.category} onValueChange={(val) => setMetadataForm({...metadataForm, category: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-isPublic">Access</Label>
              <Select value={metadataForm.isPublic ? "true" : "false"} onValueChange={(val) => setMetadataForm({...metadataForm, isPublic: val === "true"})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select access level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Public</SelectItem>
                  <SelectItem value="false">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetMetadataForm}>Cancel</Button>
            <Button onClick={handleUpdateMetadata}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}