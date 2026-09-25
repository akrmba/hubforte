// Role display helpers — maps DB role values to friendly names and descriptions.
// DB values are never changed; only the display layer uses these.

export type DbRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";

export interface RoleMeta {
  label: string;
  description: string;
  /** The underlying DB value this display role maps to */
  dbValue: DbRole;
}

export const ROLE_META: Record<string, RoleMeta> = {
  SUPER_ADMIN: {
    label: "Platform Owner",
    description: "Full platform access. Manages all tenants and system configuration.",
    dbValue: "SUPER_ADMIN",
  },
  PLATFORM_OWNER: {
    label: "Platform Owner",
    description: "Full platform access. Manages all tenants and system configuration.",
    dbValue: "SUPER_ADMIN",
  },
  ADMIN: {
    label: "Workspace Admin",
    description: "Full access within the workspace. Manages users, settings, and all records.",
    dbValue: "ADMIN",
  },
  WORKSPACE_OWNER: {
    label: "Workspace Owner",
    description: "Owns the workspace. Full access including billing and workspace settings.",
    dbValue: "ADMIN",
  },
  WORKSPACE_ADMIN: {
    label: "Workspace Admin",
    description: "Full access within the workspace. Manages users, settings, and all records.",
    dbValue: "ADMIN",
  },
  // DEVELOPER is a platform-engineering role — it has no tenant CRM access.
  // It must not appear in tenant assignment flows. Kept here for display-only
  // purposes (e.g. showing the badge on a user who already holds this role).
  DEVELOPER: {
    label: "Developer",
    description: "Platform engineering access only. Cannot access tenant CRM data.",
    dbValue: "VIEWER", // display fallback only — backend blocks all CRM access for this role
  },
  MANAGER: {
    label: "Team Manager",
    description: "Manages team activity, campaigns, and can export data.",
    dbValue: "MANAGER",
  },
  TEAM_MANAGER: {
    label: "Team Manager",
    description: "Manages team activity, campaigns, and can export data.",
    dbValue: "MANAGER",
  },
  OPERATOR: {
    label: "Team Member",
    description: "Day-to-day CRM work: outreach, campaigns, and data entry.",
    dbValue: "OPERATOR",
  },
  TEAM_MEMBER: {
    label: "Team Member",
    description: "Day-to-day CRM work: outreach, campaigns, and data entry.",
    dbValue: "OPERATOR",
  },
  VIEWER: {
    label: "Read Only",
    description: "Can view records but cannot make changes.",
    dbValue: "VIEWER",
  },
  READ_ONLY: {
    label: "Read Only",
    description: "Can view records but cannot make changes.",
    dbValue: "VIEWER",
  },
};

export function getRoleLabel(role: string): string {
  return ROLE_META[role]?.label ?? role;
}

export function getRoleDescription(role: string): string {
  return ROLE_META[role]?.description ?? "";
}

// Roles available for assignment in the invite/edit UI (excludes SUPER_ADMIN/PLATFORM_OWNER)
export const ASSIGNABLE_ROLES: { value: DbRole; label: string; description: string }[] = [
  { value: "ADMIN", label: "Workspace Admin", description: "Full access within the workspace." },
  { value: "MANAGER", label: "Team Manager", description: "Manages team activity and campaigns." },
  { value: "OPERATOR", label: "Team Member", description: "Day-to-day CRM work." },
  { value: "VIEWER", label: "Read Only", description: "View-only access." },
];
