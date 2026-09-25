/**
 * Direct API client for Phase 2–5 endpoints.
 * Authentication is handled via the crm_session HttpOnly cookie
 * set by the server on login — no Authorization header required.
 */

const BASE = "/api";

let lastRequestId: string | null = null;
export const getLastRequestId = (): string | null => lastRequestId;

// Maintenance mode detection
let isMaintenanceMode = false;
let maintenanceInfo: { message: string; estimatedResolution: string | null; enabledAt: string | null } | null = null;
const maintenanceListeners = new Set<() => void>();

export function getMaintenanceStatus() {
  return { isMaintenanceMode, maintenanceInfo };
}

export function onMaintenanceChange(cb: () => void) {
  maintenanceListeners.add(cb);
  return () => maintenanceListeners.delete(cb);
}

function setMaintenanceMode(active: boolean, data?: { message: string; estimatedResolution: string | null; enabledAt: string | null }) {
  isMaintenanceMode = active;
  maintenanceInfo = data || null;
  maintenanceListeners.forEach(cb => cb());
}

export function reportClientError(data: { message: string, stack: string, route: string, errorRefId?: string }) {
  fetch('/api/log-client-error', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // required for CSRF check
    },
    body: JSON.stringify({ ...data, userAgent: navigator.userAgent }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Phase 7C: Status-specific error toast dispatcher
// Components subscribe via onApiError; api.ts fires without a React dependency.
// requestId = internal correlation (never shown to users)
// errorRefId = customer/support reference shown in UI toasts (ERR-YYYY-MMDD-XXXX)
// ---------------------------------------------------------------------------
type ApiErrorHandler = (status: number, message: string, errorRefId?: string) => void;
let _apiErrorHandler: ApiErrorHandler | null = null;

export function registerApiErrorHandler(handler: ApiErrorHandler): void {
  _apiErrorHandler = handler;
}

function dispatchApiError(status: number, message: string, errorRefId?: string): void {
  _apiErrorHandler?.(status, message, errorRefId);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "X-Client-Request-Id": crypto.randomUUID(),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      reportClientError({
        message: "Request timeout after 30s",
        stack: error.stack || "No stack trace available",
        route: window.location.pathname,
      });
    } else {
      reportClientError({
        message: `Network error: ${error.message}`,
        stack: error.stack || "No stack trace available",
        route: window.location.pathname,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  lastRequestId = res.headers.get("X-Request-Id");

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));

    // Detect maintenance mode response
    if (res.status === 503 && err?.maintenanceMode === true) {
      setMaintenanceMode(true, {
        message: err.message || "We're performing scheduled maintenance.",
        estimatedResolution: err.estimatedResolution || null,
        enabledAt: null,
      });
    }

    // Phase 7C: status-specific toast messages
    // errorRefId = customer-facing reference from server (ERR-YYYY-MMDD-XXXX)
    // requestId stays internal — never passed to the toast layer
    const errorRefId: string | undefined = err?.errorRefId || undefined;
    if (res.status === 401) {
      dispatchApiError(401, "Please sign in to continue.");
      window.location.href = "/login";
    } else if (res.status === 403) {
      dispatchApiError(403, "You don't have permission to do that.");
    } else if (res.status === 404) {
      dispatchApiError(404, "Not found.");
    } else if (res.status === 429) {
      dispatchApiError(429, "Slow down — too many requests. Please wait a moment.");
    } else if (res.status >= 500) {
      dispatchApiError(res.status, err?.message || "Something went wrong. Please try again.", errorRefId);
    }

    reportClientError({
      message: `API Error [${res.status}]: ${err?.error || res.statusText}`,
      stack: `Endpoint: ${method} ${path}`,
      route: window.location.pathname,
      errorRefId: errorRefId,
    });
    throw Object.assign(new Error(err?.message || err?.error || res.statusText), { status: res.status, data: err });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  getRaw: async (path: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { 
        credentials: "include", 
        headers: { 
          "X-Requested-With": "XMLHttpRequest",
          "X-Client-Request-Id": crypto.randomUUID()
        },
        signal: controller.signal
      });
      lastRequestId = res.headers.get("X-Request-Id");
      return res;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        reportClientError({
          message: "Request timeout after 30s",
          stack: error.stack || "No stack trace available",
          route: window.location.pathname,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  postFormData: async <T>(path: string, formData: FormData): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { 
          "X-Requested-With": "XMLHttpRequest",
          "X-Client-Request-Id": crypto.randomUUID()
        },
        credentials: "include",
        body: formData,
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        reportClientError({
          message: "Request timeout after 30s",
          stack: error.stack || "No stack trace available",
          route: window.location.pathname,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    
    lastRequestId = res.headers.get("X-Request-Id");

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      reportClientError({
        message: `API Error [${res.status}]: ${err?.error || res.statusText}`,
        stack: `Endpoint: POST ${path} (FormData)`,
        route: window.location.pathname,
        errorRefId: err?.errorRefId || undefined,
      });
      throw Object.assign(new Error(err?.error || res.statusText), { status: res.status, data: err });
    }
    return res.json();
  },
};

// Feature flags
export interface FeatureFlag {
  module: string;
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string | null;
}

export function getFeatureFlags(): Promise<FeatureFlag[]> {
  return api.get<FeatureFlag[]>("/feature-flags");
}

export function getSuperAdminFeatureFlags(): Promise<FeatureFlag[]> {
  return api.get<FeatureFlag[]>("/super-admin/feature-flags");
}

export function toggleFeatureFlag(module: string, enabled: boolean): Promise<FeatureFlag> {
  return api.patch<FeatureFlag>(`/super-admin/feature-flags/${module}`, { enabled });
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: "active" | "suspended";
  active: boolean;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
}

export interface TenantAdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: "ADMIN";
  active: boolean;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  domain?: string;
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminPassword?: string;
}

export interface CreateTenantResponse {
  tenant: Tenant;
  adminUser: TenantAdminUser | null;
}

export interface TenantFeatureFlag {
  module: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export function getTenants(): Promise<Tenant[]> {
  return api.get<Tenant[]>("/super-admin/tenants");
}

export function createTenant(data: CreateTenantInput): Promise<CreateTenantResponse> {
  return api.post<CreateTenantResponse>("/super-admin/tenants", data);
}

export function updateTenant(
  id: string,
  data: Partial<{ name: string; slug: string; domain: string; active: boolean; suspended: boolean }>
): Promise<Tenant> {
  return api.patch<Tenant>(`/super-admin/tenants/${id}`, data);
}

export function updateTenantStatus(id: string, status: "active" | "suspended"): Promise<Tenant> {
  return api.patch<Tenant>(`/super-admin/tenants/${id}/status`, { status });
}

export function getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlag[]> {
  return api.get<TenantFeatureFlag[]>(`/super-admin/tenants/${tenantId}/feature-flags`);
}

export function toggleTenantFeatureFlag(tenantId: string, module: string, enabled: boolean): Promise<TenantFeatureFlag> {
  return api.patch<TenantFeatureFlag>(`/super-admin/tenants/${tenantId}/feature-flags/${module}`, { enabled });
}

// Module Control Centre types and functions

export interface TenantModule {
  key: string;
  enabled: boolean;
  isOverride: boolean;
  defaultValue: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface GlobalModule {
  key: string;
  name: string;
  description: string;
  category: string;
  required: boolean;
  defaultEnabled: boolean;
  dependencies: string[];
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function getTenantModules(tenantId: string): Promise<TenantModule[]> {
  return api.get<TenantModule[]>(`/super-admin/tenants/${tenantId}/modules`);
}

export function toggleTenantModule(tenantId: string, moduleKey: string, enabled: boolean): Promise<{ key: string; enabled: boolean }> {
  return api.patch<{ key: string; enabled: boolean }>(`/super-admin/tenants/${tenantId}/modules/${moduleKey}`, { enabled });
}

export function resetTenantModules(tenantId: string): Promise<{ reset: number }> {
  return api.post<{ reset: number }>(`/super-admin/tenants/${tenantId}/modules/reset`, {});
}

export interface TenantAiSettings {
  byokEnabled: boolean;
  aiDiagnosisEnabled: boolean;
}

export function getTenantAiSettings(tenantId: string): Promise<TenantAiSettings> {
  return api.get<TenantAiSettings>(`/super-admin/tenants/${tenantId}/ai-settings`);
}

export function updateTenantAiSettings(tenantId: string, data: Partial<TenantAiSettings>): Promise<TenantAiSettings> {
  return api.patch<TenantAiSettings>(`/super-admin/tenants/${tenantId}/ai-settings`, data);
}

export function getGlobalModules(): Promise<GlobalModule[]> {
  return api.get<GlobalModule[]>(`/super-admin/modules/global`);
}

export function toggleGlobalModule(moduleKey: string, enabled: boolean): Promise<{ key: string; enabled: boolean; tenantsAffected: number }> {
  return api.patch<{ key: string; enabled: boolean; tenantsAffected: number }>(`/super-admin/modules/global/${moduleKey}`, { enabled });
}

// Notifications
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  read: boolean;
  link: string | null;
  createdAt: string;
}

export function getNotifications(): Promise<AppNotification[]> {
  return api.get<AppNotification[]>("/notifications");
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return api.patch<AppNotification>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ message: string }> {
  return api.patch<{ message: string }>("/notifications/read-all");
}

export function deleteNotification(id: string): Promise<{ message: string }> {
  return api.del<{ message: string }>(`/notifications/${id}`);
}

// AI helpers
export interface AiResult {
  success: boolean;
  result?: string;
  error?: string;
}

export interface AiCleanResult {
  success: boolean;
  result?: { issues?: Array<{ description: string; suggestedFix?: string; severity?: string }> };
  error?: string;
}

export function draftEmail(params: { recipientName: string; context: string; tone?: string }): Promise<AiResult> {
  return api.post<AiResult>("/ai/draft-email", params);
}

export function summariseRelationship(params: { contactName: string; history: string }): Promise<AiResult> {
  return api.post<AiResult>("/ai/summarise-contact", params);
}

export function suggestNextAction(params: { contactName: string; history: string }): Promise<AiResult> {
  return api.post<AiResult>("/ai/suggest-next-action", params);
}

export function cleanContactData(params: { contacts: any[] }): Promise<AiCleanResult> {
  return api.post<AiCleanResult>("/ai/clean-data", params);
}

export function diagnoseTicket(ticketId: string): Promise<any> {
  return api.post(`/support/tickets/${ticketId}/diagnose`, {});
}

export function getAiLogs(): Promise<any[]> {
  return api.get<any[]>("/ai/logs");
}

// --- Unified API Methods (formerly Yes Futures specific) ---

export const getYfDashboard = () => api.get<any>("/dashboard");

export const getYfSchools = (params?: Record<string, string>) => {
  const merged = { ...params, type: 'SCHOOL' };
  const qs = new URLSearchParams(merged).toString();
  return api.get<any>(`/organizations?${qs}`);
};
export const getYfSchool = (id: string) => api.get<any>(`/organizations/${id}`);
export const createYfSchool = (data: any) => api.post<any>("/organizations", { ...data, type: 'SCHOOL' });
export const updateYfSchool = (id: string, data: any) => api.patch<any>(`/organizations/${id}`, data);
export const deleteYfSchool = (id: string) => api.del<any>(`/organizations/${id}`);
export const getYfSchoolsPipeline = () => api.get<any>("/organizations?type=SCHOOL&limit=100");

export const getYfTrusts = (params?: Record<string, string>) => {
  const merged = { ...params, type: 'TRUST' };
  const qs = new URLSearchParams(merged).toString();
  return api.get<any>(`/organizations?${qs}`);
};
export const getYfTrust = (id: string) => api.get<any>(`/organizations/${id}`);
export const createYfTrust = (data: any) => api.post<any>("/organizations", { ...data, type: 'TRUST' });
export const updateYfTrust = (id: string, data: any) => api.patch<any>(`/organizations/${id}`, data);
export const deleteYfTrust = (id: string) => api.del<any>(`/organizations/${id}`);

export const getYfContacts = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/contacts${qs ? `?${qs}` : ''}`);
};
export const getYfContact = (id: string) => api.get<any>(`/contacts/${id}`);
export const createYfContact = (data: any) => api.post<any>("/contacts", data);
export const updateYfContact = (id: string, data: any) => api.patch<any>(`/contacts/${id}`, data);
export const deleteYfContact = (id: string) => api.del<any>(`/contacts/${id}`);

export const getYfSponsors = (params?: Record<string, string>) => {
  const merged = { ...params, type: 'SPONSOR' };
  const qs = new URLSearchParams(merged).toString();
  return api.get<any>(`/organizations?${qs}`);
};
export const getYfSponsor = (id: string) => api.get<any>(`/organizations/${id}`);
export const createYfSponsor = (data: any) => api.post<any>("/organizations", { ...data, type: 'SPONSOR' });
export const updateYfSponsor = (id: string, data: any) => api.patch<any>(`/organizations/${id}`, data);
export const deleteYfSponsor = (id: string) => api.del<any>(`/organizations/${id}`);

export const getYfFunding = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/opportunities${qs ? `?${qs}` : ''}`);
};
export const getYfFundingDetail = (id: string) => api.get<any>(`/opportunities/${id}`);
export const createYfFunding = (data: any) => api.post<any>("/opportunities", data);
export const updateYfFunding = (id: string, data: any) => api.patch<any>(`/opportunities/${id}`, data);
export const deleteYfFunding = (id: string) => api.del<any>(`/opportunities/${id}`);
export const getYfUpcomingRenewals = () => api.get<any>("/opportunities?stage=ACTIVE&limit=50");

export const getYfProgrammes = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/programmes${qs ? `?${qs}` : ''}`);
};
export const getYfProgramme = (id: string) => api.get<any>(`/programmes/${id}`);
export const createYfProgramme = (data: any) => api.post<any>("/programmes", data);
export const updateYfProgramme = (id: string, data: any) => api.patch<any>(`/programmes/${id}`, data);
export const deleteYfProgramme = (id: string) => api.del<any>(`/programmes/${id}`);

export const getYfStudents = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/students${qs ? `?${qs}` : ''}`);
};
export const getYfStudent = (id: string) => api.get<any>(`/students/${id}`);
export const createYfStudent = (data: any) => api.post<any>("/students", data);
export const updateYfStudent = (id: string, data: any) => api.patch<any>(`/students/${id}`, data);
export const deleteYfStudent = (id: string) => api.del<any>(`/students/${id}`);

export const getYfVolunteers = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/volunteers${qs ? `?${qs}` : ''}`);
};
export const getYfVolunteer = (id: string) => api.get<any>(`/volunteers/${id}`);
export const createYfVolunteer = (data: any) => api.post<any>("/volunteers", data);
export const updateYfVolunteer = (id: string, data: any) => api.patch<any>(`/volunteers/${id}`, data);
export const deleteYfVolunteer = (id: string) => api.del<any>(`/volunteers/${id}`);
export const getYfDbsAlerts = () => api.get<any>("/volunteers?dbsStatus=EXPIRED");

export const getYfPlacements = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/placements${qs ? `?${qs}` : ''}`);
};
export const createYfPlacement = (data: any) => api.post<any>("/placements", data);
export const updateYfPlacement = (id: string, data: any) => api.patch<any>(`/placements/${id}`, data);
export const deleteYfPlacement = (id: string) => api.del<any>(`/placements/${id}`);

export const getYfActivities = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/activities${qs ? `?${qs}` : ''}`);
};
export const getYfOverdueActivities = () => api.get<any>("/activities?overdue=true");
export const createYfActivity = (data: any) => api.post<any>("/activities", data);
export const updateYfActivity = (id: string, data: any) => api.patch<any>(`/activities/${id}`, data);
export const deleteYfActivity = (id: string) => api.del<any>(`/activities/${id}`);

export const getYfFunderImpactReport = (sponsorId: string) => api.get<any>(`/reports/funder-impact/${sponsorId}`);

// Super Admin Diagnostics
export function getSuperAdminDiagnostics(): Promise<any> {
  return api.get<any>("/super-admin/diagnostics");
}

export function resolveError(id: string, note?: string): Promise<any> {
  return api.patch<any>(`/super-admin/errors/${id}/resolve`, { note });
}

export function getErrorLogs(page = 1, limit = 20): Promise<any> {
  return api.get<any>(`/super-admin/error-logs?page=${page}&limit=${limit}`);
}

export function getErrorLogDetail(id: string): Promise<any> {
  return api.get<any>(`/super-admin/error-logs/${id}`);
}

export function getErrorChart(): Promise<any> {
  return api.get<any>("/super-admin/error-chart");
}

// Super Admin AI Config
export interface AiConfigResponse {
  defaultProvider: string;
  defaultModel: string;
  availableProviders: string[];
  models: Array<{ key: string; displayName: string; provider: string; supportsJsonMode: boolean }>;
}

export function getAiConfig(): Promise<AiConfigResponse> {
  return api.get<AiConfigResponse>("/super-admin/ai-config");
}

export function saveAiConfig(provider: string, model: string): Promise<{ success: boolean; provider: string; model: string }> {
  return api.patch("/super-admin/ai-config", { provider, model });
}

export function getSuperAdminAiLogs(): Promise<any[]> {
  return api.get<any[]>("/super-admin/ai-logs");
}

// Field Visibility API
export interface FieldVisibilityConfig {
  id: string;
  tenantId: string;
  entityType: string;
  fieldPath: string;
  visible: boolean;
  required: boolean;
  labelOverride?: string;
  helpText?: string;
  validationRules?: any;
  displayOrder?: string;
  visibleToRoles?: string[];
  editableByRoles?: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  canEdit?: boolean; // Computed field from user endpoint
}

export interface UserFieldVisibilityConfig extends Omit<FieldVisibilityConfig, 'visibleToRoles' | 'editableByRoles' | 'updatedBy'> {
  canEdit: boolean;
}

export function getFieldVisibility(entityType: string): Promise<UserFieldVisibilityConfig[]> {
  return api.get<UserFieldVisibilityConfig[]>(`/field-visibility/${entityType}`);
}

export function getAdminFieldVisibility(entityType?: string): Promise<FieldVisibilityConfig[]> {
  const query = entityType ? `?entityType=${encodeURIComponent(entityType)}` : '';
  return api.get<FieldVisibilityConfig[]>(`/admin/field-visibility${query}`);
}

export function getAdminFieldVisibilityByPath(entityType: string, fieldPath: string): Promise<FieldVisibilityConfig> {
  return api.get<FieldVisibilityConfig>(`/admin/field-visibility/${entityType}/${fieldPath}`);
}

export function saveFieldVisibility(config: {
  entityType: string;
  fieldPath: string;
  visible?: boolean;
  required?: boolean;
  labelOverride?: string;
  helpText?: string;
  validationRules?: any;
  displayOrder?: string;
  visibleToRoles?: string[];
  editableByRoles?: string[];
}): Promise<FieldVisibilityConfig> {
  return api.post<FieldVisibilityConfig>('/admin/field-visibility', config);
}

export function batchSaveFieldVisibility(updates: Array<{
  entityType: string;
  fieldPath: string;
  visible?: boolean;
  required?: boolean;
  labelOverride?: string;
  helpText?: string;
  validationRules?: any;
  displayOrder?: string;
  visibleToRoles?: string[];
  editableByRoles?: string[];
}>): Promise<{ results: Array<{ entityType: string; fieldPath: string; success: boolean; data?: FieldVisibilityConfig; error?: string }> }> {
  return api.post<{ results: Array<{ entityType: string; fieldPath: string; success: boolean; data?: FieldVisibilityConfig; error?: string }> }>(
    '/admin/field-visibility/batch',
    { updates }
  );
}

export function deleteFieldVisibility(entityType: string, fieldPath: string): Promise<{ success: boolean; message: string }> {
  return api.delete<{ success: boolean; message: string }>(`/admin/field-visibility/${entityType}/${fieldPath}`);
}

// Record Types API
export interface RecordTypeConfig {
  id: string;
  tenantId: string;
  entityType: string;
  recordType: string;
  displayName: string;
  description?: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  allowedTransitions?: string[];
  validationRules?: any;
  workflowRules?: any;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface UserRecordTypeConfig extends Pick<RecordTypeConfig, 
  'id' | 'recordType' | 'displayName' | 'description' | 'icon' | 'color' | 'isDefault' | 'validationRules' | 'metadata'
> {}

export function getRecordTypes(entityType: string): Promise<UserRecordTypeConfig[]> {
  return api.get<UserRecordTypeConfig[]>(`/record-types/${entityType}`);
}

export function getDefaultRecordType(entityType: string): Promise<UserRecordTypeConfig> {
  return api.get<UserRecordTypeConfig>(`/record-types/${entityType}/default`);
}

export function getAdminRecordTypes(entityType?: string, activeOnly?: boolean): Promise<RecordTypeConfig[]> {
  const params = new URLSearchParams();
  if (entityType) params.append('entityType', entityType);
  if (activeOnly !== undefined) params.append('activeOnly', activeOnly.toString());
  const query = params.toString() ? `?${params.toString()}` : '';
  return api.get<RecordTypeConfig[]>(`/admin/record-types${query}`);
}

export function getAdminRecordTypeById(id: string): Promise<RecordTypeConfig> {
  return api.get<RecordTypeConfig>(`/admin/record-types/${id}`);
}

export function createRecordType(config: {
  entityType: string;
  recordType: string;
  displayName: string;
  description?: string;
  icon?: string;
  color?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  allowedTransitions?: string[];
  validationRules?: any;
  workflowRules?: any;
  metadata?: any;
}): Promise<RecordTypeConfig> {
  return api.post<RecordTypeConfig>('/admin/record-types', config);
}

export function updateRecordType(id: string, config: {
  displayName?: string;
  description?: string;
  icon?: string;
  color?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  allowedTransitions?: string[];
  validationRules?: any;
  workflowRules?: any;
  metadata?: any;
}): Promise<RecordTypeConfig> {
  return api.put<RecordTypeConfig>(`/admin/record-types/${id}`, config);
}

export function deleteRecordType(id: string): Promise<{ success: boolean; message: string }> {
  return api.delete<{ success: boolean; message: string }>(`/admin/record-types/${id}`);
}

// Programme Cohorts API
export function getProgrammeCohorts(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/programme-cohorts${qs ? `?${qs}` : ''}`);
}
export function getProgrammeCohort(id: string): Promise<any> {
  return api.get<any>(`/programme-cohorts/${id}`);
}
export function createProgrammeCohort(data: any): Promise<any> {
  return api.post<any>('/programme-cohorts', data);
}
export function updateProgrammeCohort(id: string, data: any): Promise<any> {
  return api.patch<any>(`/programme-cohorts/${id}`, data);
}
export function deleteProgrammeCohort(id: string): Promise<any> {
  return api.del<any>(`/programme-cohorts/${id}`);
}

// Programme Sessions API
export function getProgrammeSessions(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/programme-sessions${qs ? `?${qs}` : ''}`);
}
export function getProgrammeSession(id: string): Promise<any> {
  return api.get<any>(`/programme-sessions/${id}`);
}
export function createProgrammeSession(data: any): Promise<any> {
  return api.post<any>('/programme-sessions', data);
}
export function updateProgrammeSession(id: string, data: any): Promise<any> {
  return api.patch<any>(`/programme-sessions/${id}`, data);
}
export function deleteProgrammeSession(id: string): Promise<any> {
  return api.del<any>(`/programme-sessions/${id}`);
}

// Session Attendance API
export function getSessionAttendance(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/session-attendance${qs ? `?${qs}` : ''}`);
}
export function createSessionAttendance(data: any): Promise<any> {
  return api.post<any>('/session-attendance', data);
}
export function createBatchAttendance(sessionId: string, records: any[]): Promise<any> {
  return api.post<any>('/session-attendance/batch', { sessionId, records });
}
export function updateSessionAttendance(id: string, data: any): Promise<any> {
  return api.patch<any>(`/session-attendance/${id}`, data);
}
export function deleteSessionAttendance(id: string): Promise<any> {
  return api.del<any>(`/session-attendance/${id}`);
}

// Outcome Frameworks API
export function getOutcomeFrameworks(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/outcome-frameworks${qs ? `?${qs}` : ''}`);
}
export function getOutcomeFramework(id: string): Promise<any> {
  return api.get<any>(`/outcome-frameworks/${id}`);
}
export function createOutcomeFramework(data: any): Promise<any> {
  return api.post<any>('/outcome-frameworks', data);
}
export function updateOutcomeFramework(id: string, data: any): Promise<any> {
  return api.patch<any>(`/outcome-frameworks/${id}`, data);
}
export function deleteOutcomeFramework(id: string): Promise<any> {
  return api.del<any>(`/outcome-frameworks/${id}`);
}
export function getPlatformOutcomeDefaults(): Promise<any> {
  return api.get<any>('/outcome-frameworks/platform/defaults');
}

// Outcome Records API
export function getOutcomeRecords(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/outcome-records${qs ? `?${qs}` : ''}`);
}
export function getOutcomeRecord(id: string): Promise<any> {
  return api.get<any>(`/outcome-records/${id}`);
}
export function createOutcomeRecord(data: any): Promise<any> {
  return api.post<any>('/outcome-records', data);
}
export function updateOutcomeRecord(id: string, data: any): Promise<any> {
  return api.patch<any>(`/outcome-records/${id}`, data);
}
export function createBatchOutcomeRecords(records: any[]): Promise<any> {
  return api.post<any>('/outcome-records/batch', { records });
}
export function getStudentOutcomeSummary(studentId: string): Promise<any> {
  return api.get<any>(`/outcome-records/summary/${studentId}`);
}
export function getStudentOutcomeComparison(studentId: string): Promise<any> {
  return api.get<any>(`/outcome-records/comparison/${studentId}`);
}

// Safeguarding Notes API
export function getSafeguardingNotes(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/safeguarding-notes${qs ? `?${qs}` : ''}`);
}
export function getSafeguardingNote(id: string, reason: string): Promise<any> {
  return api.get<any>(`/safeguarding-notes/${id}?reason=${encodeURIComponent(reason)}`);
}
export function createSafeguardingNote(data: any): Promise<any> {
  return api.post<any>('/safeguarding-notes', data);
}
export function updateSafeguardingNote(id: string, data: any): Promise<any> {
  return api.put<any>(`/safeguarding-notes/${id}`, data);
}
export function deleteSafeguardingNote(id: string, reason: string): Promise<any> {
  return api.del<any>(`/safeguarding-notes/${id}`, { reason });
}

// Safeguarding Access Logs API
export function getSafeguardingAccessLogs(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/safeguarding-access-logs${qs ? `?${qs}` : ''}`);
}
export function getSafeguardingAccessLogsByNote(noteId: string, params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/safeguarding-access-logs/note/${noteId}${qs ? `?${qs}` : ''}`);
}
export function getSafeguardingAccessLogsByUser(userId: string, params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/safeguarding-access-logs/user/${userId}${qs ? `?${qs}` : ''}`);
}
export function getSafeguardingAccessLogsSummary(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/safeguarding-access-logs/stats/summary${qs ? `?${qs}` : ''}`);
}

// Attachments API
export function getAttachments(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/attachments${qs ? `?${qs}` : ''}`);
}
export function getAttachment(id: string): Promise<any> {
  return api.get<any>(`/attachments/${id}`);
}
export function uploadAttachment(data: FormData): Promise<any> {
  return fetch('/api/attachments', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
    body: data,
  }).then(r => { if (!r.ok) throw new Error('Upload failed'); return r.json(); });
}
export function deleteAttachment(id: string): Promise<any> {
  return api.del<any>(`/attachments/${id}`);
}
export function downloadAttachment(id: string): Promise<Blob> {
  return fetch(`/api/attachments/${id}/download`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
  }).then(r => { if (!r.ok) throw new Error('Download failed'); return r.blob(); });
}
export function getEntityAttachments(entityType: string, entityId: string): Promise<any> {
  return api.get<any>(`/attachments/entity/${entityType}/${entityId}`);
}
export function updateAttachmentMetadata(id: string, data: any): Promise<any> {
  return api.post<any>(`/attachments/${id}/update-metadata`, data);
}
export function getAttachmentsDashboardStats(): Promise<any> {
  return api.get<any>('/attachments/dashboard/stats');
}

// Consent Records API
export function getConsentRecords(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/consent-records${qs ? `?${qs}` : ''}`);
}
export function getConsentRecord(id: string): Promise<any> {
  return api.get<any>(`/consent-records/${id}`);
}
export function createConsentRecord(data: any): Promise<any> {
  return api.post<any>('/consent-records', data);
}
export function updateConsentRecord(id: string, data: any): Promise<any> {
  return api.put<any>(`/consent-records/${id}`, data);
}
export function deleteConsentRecord(id: string): Promise<any> {
  return api.del<any>(`/consent-records/${id}`);
}
export function withdrawConsentRecord(id: string, reason?: string): Promise<any> {
  return api.post<any>(`/consent-records/${id}/withdraw`, { reason });
}
export function getStudentConsentSummary(studentId: string): Promise<any> {
  return api.get<any>(`/consent-records/student/${studentId}/summary`);
}
export function getConsentDashboardStatus(): Promise<any> {
  return api.get<any>('/consent-records/dashboard/status');
}

// Parent/Guardians API
export function getParentGuardians(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/parent-guardians${qs ? `?${qs}` : ''}`);
}
export function getParentGuardian(id: string): Promise<any> {
  return api.get<any>(`/parent-guardians/${id}`);
}
export function createParentGuardian(data: any): Promise<any> {
  return api.post<any>('/parent-guardians', data);
}
export function updateParentGuardian(id: string, data: any): Promise<any> {
  return api.put<any>(`/parent-guardians/${id}`, data);
}
export function deleteParentGuardian(id: string): Promise<any> {
  return api.del<any>(`/parent-guardians/${id}`);
}
export function getStudentParentGuardianSummary(studentId: string): Promise<any> {
  return api.get<any>(`/parent-guardians/student/${studentId}/summary`);
}

// Reporting API
export function getReportTypes(): Promise<any> {
  return api.get<any>('/reports/types');
}
export function getReportType(id: string): Promise<any> {
  return api.get<any>(`/reports/types/${id}`);
}
export function executeReport(data: any): Promise<any> {
  return api.post<any>('/reports/execute', data);
}
export function getSavedReports(): Promise<any> {
  return api.get<any>('/reports/saved');
}
export function getSavedReport(id: string): Promise<any> {
  return api.get<any>(`/reports/saved/${id}`);
}
export function createSavedReport(data: any): Promise<any> {
  return api.post<any>('/reports/saved', data);
}

// Report Schedules
export function getReportSchedules(): Promise<any> {
  return api.get<any>('/reports/schedules');
}
export function createReportSchedule(data: { savedReportId: string; frequency: string; recipientUserIds?: string[] }): Promise<any> {
  return api.post<any>('/reports/schedules', data);
}
export function updateReportSchedule(id: string, data: { frequency?: string; enabled?: boolean; recipientUserIds?: string[] }): Promise<any> {
  return api.patch<any>(`/reports/schedules/${id}`, data);
}
export function deleteReportSchedule(id: string): Promise<any> {
  return api.del<any>(`/reports/schedules/${id}`);
}
export function updateSavedReport(id: string, data: any): Promise<any> {
  return api.put<any>(`/reports/saved/${id}`, data);
}
export function deleteSavedReport(id: string): Promise<any> {
  return api.del<any>(`/reports/saved/${id}`);
}
export function exportSavedReportCsv(id: string): Promise<Blob> {
  return fetch(`/api/reports/saved/${id}/export/csv`, {
    headers: { "X-Requested-With": "XMLHttpRequest" },
    credentials: "include",
  }).then(r => { if (!r.ok) throw new Error("Export failed"); return r.blob(); });
}
export function getDashboards(): Promise<any> {
  return api.get<any>('/reports/dashboards');
}
export function getDashboard(id: string): Promise<any> {
  return api.get<any>(`/reports/dashboards/${id}`);
}
export function createDashboard(data: any): Promise<any> {
  return api.post<any>('/reports/dashboards', data);
}
export function updateDashboard(id: string, data: any): Promise<any> {
  return api.put<any>(`/reports/dashboards/${id}`, data);
}
export function deleteDashboard(id: string): Promise<any> {
  return api.del<any>(`/reports/dashboards/${id}`);
}
export function generateEvidencePack(fundingOpportunityId: string): Promise<Blob> {
  return fetch('/api/reports/evidence-pack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
    body: JSON.stringify({ fundingOpportunityId }),
  }).then(r => { if (!r.ok) throw new Error('Evidence pack generation failed'); return r.blob(); });
}

// Automation Rules API
export function getAutomationRules(): Promise<any> { return api.get<any>('/automation-rules'); }
export function getAutomationRule(id: string): Promise<any> { return api.get<any>(`/automation-rules/${id}`); }
export function createAutomationRule(data: any): Promise<any> { return api.post<any>('/automation-rules', data); }
export function updateAutomationRule(id: string, data: any): Promise<any> { return api.put<any>(`/automation-rules/${id}`, data); }
export function deleteAutomationRule(id: string): Promise<any> { return api.del<any>(`/automation-rules/${id}`); }
export function toggleAutomationRule(id: string): Promise<any> { return api.patch<any>(`/automation-rules/${id}/toggle`); }
export function getChangeEvents(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/automation-rules/change-events${qs ? `?${qs}` : ''}`);
}
export function getFieldHistory(params?: Record<string, string>): Promise<any> {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return api.get<any>(`/automation-rules/field-history${qs ? `?${qs}` : ''}`);
}

// Import API
export function importGias(records: any[]): Promise<any> { return api.post<any>('/import/gias', records); }
export function importOfsted(records: any[]): Promise<any> { return api.post<any>('/import/ofsted', records); }
export function importCsv(entityType: string, records: any[], dryRun = false): Promise<any> {
  return api.post<any>('/import/csv', { entityType, records, dryRun });
}

