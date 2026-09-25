// DB role values (stored in postgres). Never rename these.
// PLATFORM_OWNER is a display alias for SUPER_ADMIN — same DB value.
// WORKSPACE_OWNER is a display alias for ADMIN with ownership semantics.
// DEVELOPER maps to system-level read-only — cannot see tenant client data.
// PLATFORM_BUILDER = DEVELOPER + can read framework docs and agent context via admin UI.
export type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "OPERATOR"
  | "VIEWER"
  | "PLATFORM_OWNER"
  | "WORKSPACE_OWNER"
  | "WORKSPACE_ADMIN"
  | "TEAM_MANAGER"
  | "TEAM_MEMBER"
  | "READ_ONLY"
  | "DEVELOPER"
  | "PLATFORM_BUILDER";

type Action =
  | "manage_users"
  | "delete_records"
  | "send_outreach"
  | "view_all_records"
  | "export_data"
  | "manage_settings"
  | "create_campaigns"
  | "manage_templates"
  | "import_data"
  | "view_safeguarding"
  | "create_safeguarding"
  | "update_safeguarding"
  | "delete_safeguarding"
  | "audit_safeguarding";

const ALL_ACTIONS: Action[] = [
  "manage_users",
  "delete_records",
  "send_outreach",
  "view_all_records",
  "export_data",
  "manage_settings",
  "create_campaigns",
  "manage_templates",
  "import_data",
  "view_safeguarding",
  "create_safeguarding",
  "update_safeguarding",
  "delete_safeguarding",
  "audit_safeguarding",
];

const ADMIN_ACTIONS: Action[] = [
  "manage_users",
  "delete_records",
  "send_outreach",
  "view_all_records",
  "export_data",
  "manage_settings",
  "create_campaigns",
  "manage_templates",
  "import_data",
  "view_safeguarding",
  "create_safeguarding",
  "update_safeguarding",
  "delete_safeguarding",
  "audit_safeguarding",
];

const MANAGER_ACTIONS: Action[] = [
  "delete_records",
  "send_outreach",
  "view_all_records",
  "export_data",
  "create_campaigns",
  "manage_templates",
  "import_data",
  "view_safeguarding",
];

const OPERATOR_ACTIONS: Action[] = [
  "send_outreach",
  "view_all_records",
  "create_campaigns",
  "manage_templates",
  "import_data",
];

const permissions: Record<Role, Action[]> = {
  // Legacy DB values — keep these intact
  SUPER_ADMIN: ALL_ACTIONS,
  ADMIN: ADMIN_ACTIONS,
  MANAGER: MANAGER_ACTIONS,
  OPERATOR: OPERATOR_ACTIONS,
  VIEWER: ["view_all_records"],
  // New display roles — map to equivalent permission sets
  PLATFORM_OWNER: ALL_ACTIONS,       // same as SUPER_ADMIN
  WORKSPACE_OWNER: ADMIN_ACTIONS,    // same as ADMIN
  WORKSPACE_ADMIN: ADMIN_ACTIONS,    // same as ADMIN
  TEAM_MANAGER: MANAGER_ACTIONS,     // same as MANAGER
  TEAM_MEMBER: OPERATOR_ACTIONS,     // same as OPERATOR
  READ_ONLY: ["view_all_records"],   // same as VIEWER
  DEVELOPER: [],                     // system-level only — no tenant client data access
  PLATFORM_BUILDER: [],              // system-level + framework docs — no tenant client data access
};

export function canDo(role: Role, action: Action): boolean {
  return permissions[role]?.includes(action) ?? false;
}

export function requirePermission(role: Role, action: Action): void {
  if (!canDo(role, action)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}
