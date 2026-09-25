/**
 * Module Registry
 * 
 * Defines all modules in the system, their metadata, and dependencies.
 * This is used for:
 * - Feature flag management
 * - Module dependency validation
 * - UI display of module information
 * - Module enablement/disablement logic
 */

export interface ModuleDefinition {
  /** Module key (must match feature_flag.module) */
  key: string;
  /** Display name for UI */
  name: string;
  /** Detailed description */
  description: string;
  /** Module category for grouping */
  category: ModuleCategory;
  /** Version when module was introduced */
  version: string;
  /** Whether this module is required for core functionality */
  required: boolean;
  /** Modules that must be enabled for this module to work */
  dependencies: string[];
  /** Modules that conflict with this module */
  conflicts: string[];
  /** Default enabled state for new tenants */
  defaultEnabled: boolean;
  /** Icon for UI display */
  icon?: string;
  /** Documentation URL */
  docsUrl?: string;
  /** Configuration schema for module-specific settings */
  configSchema?: Record<string, any>;
}

export type ModuleCategory = 
  | 'core'        // Core CRM functionality
  | 'entities'    // Data entities (organizations, contacts, etc.)
  | 'engagement'  // Outreach and communication
  | 'delivery'    // Programme delivery and tracking
  | 'compliance'  // Safeguarding, consent, outcomes
  | 'analytics'   // Reporting and dashboards
  | 'automation'  // Workflow automation
  | 'integrations'; // External integrations

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // Core Modules (required for basic CRM functionality)
  {
    key: 'organisations',
    name: 'Organizations',
    description: 'Manage schools, trusts, sponsors, and other organizations',
    category: 'core',
    version: '1.0.0',
    required: true,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'building',
    docsUrl: '/docs/modules/organizations',
  },
  {
    key: 'contacts',
    name: 'Contacts',
    description: 'Manage people (students, parents, staff, volunteers, donors)',
    category: 'core',
    version: '1.0.0',
    required: true,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'users',
    docsUrl: '/docs/modules/contacts',
  },
  {
    key: 'activities',
    name: 'Activities',
    description: 'Track meetings, calls, emails, and other interactions',
    category: 'core',
    version: '1.0.0',
    required: true,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'calendar',
    docsUrl: '/docs/modules/activities',
  },

  // Entity Modules (specific entity types)
  {
    key: 'schools',
    name: 'Schools',
    description: 'School-specific features and data',
    category: 'entities',
    version: '1.0.0',
    required: false,
    dependencies: ['organisations'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'school',
    docsUrl: '/docs/modules/schools',
  },
  {
    key: 'trusts',
    name: 'Trusts',
    description: 'Multi-academy trust features',
    category: 'entities',
    version: '1.0.0',
    required: false,
    dependencies: ['organisations'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'layers',
    docsUrl: '/docs/modules/trusts',
  },
  {
    key: 'sponsors',
    name: 'Sponsors',
    description: 'Sponsor organization features',
    category: 'entities',
    version: '1.0.0',
    required: false,
    dependencies: ['organisations'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'handshake',
    docsUrl: '/docs/modules/sponsors',
  },
  {
    key: 'programmes',
    name: 'Programmes',
    description: 'Programme management and delivery',
    category: 'delivery',
    version: '1.1.0',
    required: false,
    dependencies: ['organisations'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'graduation-cap',
    docsUrl: '/docs/modules/programmes',
  },
  {
    key: 'students',
    name: 'Students',
    description: 'Student management and tracking',
    category: 'delivery',
    version: '1.1.0',
    required: false,
    dependencies: ['contacts', 'programmes'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'user-graduate',
    docsUrl: '/docs/modules/students',
  },
  {
    key: 'volunteers',
    name: 'Volunteers',
    description: 'Volunteer management and engagement',
    category: 'delivery',
    version: '1.1.0',
    required: false,
    dependencies: ['contacts'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'hands-helping',
    docsUrl: '/docs/modules/volunteers',
  },

  // Engagement Modules
  {
    key: 'outreach',
    name: 'Outreach',
    description: 'Email campaigns, templates, and communication',
    category: 'engagement',
    version: '1.2.0',
    required: false,
    dependencies: ['contacts'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'mail',
    docsUrl: '/docs/modules/outreach',
  },

  // Funding Modules
  {
    key: 'funders',
    name: 'Funders',
    description: 'Funding organization management',
    category: 'entities',
    version: '1.3.0',
    required: false,
    dependencies: ['organisations'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'money-bill-wave',
    docsUrl: '/docs/modules/funders',
  },
  {
    key: 'funding',
    name: 'Funding',
    description: 'Funding opportunity and grant management',
    category: 'entities',
    version: '1.3.0',
    required: false,
    dependencies: ['funders'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'hand-holding-usd',
    docsUrl: '/docs/modules/funding',
  },
  {
    key: 'pipeline',
    name: 'Pipeline',
    description: 'Funding pipeline and opportunity tracking',
    category: 'analytics',
    version: '1.3.0',
    required: false,
    dependencies: ['funders', 'funding'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'chart-line',
    docsUrl: '/docs/modules/pipeline',
  },

  // Analytics Modules
  {
    key: 'reports',
    name: 'Reports',
    description: 'Reporting and data analysis',
    category: 'analytics',
    version: '1.4.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'chart-bar',
    docsUrl: '/docs/modules/reports',
  },

  // Support Modules
  {
    key: 'support',
    name: 'Support',
    description: 'Help desk and support ticket management',
    category: 'core',
    version: '1.5.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'headset',
    docsUrl: '/docs/modules/support',
  },

  // Phase 3+ Modules (Platform Configuration)
  {
    key: 'field_visibility',
    name: 'Field Visibility',
    description: 'Tenant-specific field visibility and requirements',
    category: 'core',
    version: '2.0.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'eye',
    docsUrl: '/docs/modules/field-visibility',
  },
  {
    key: 'record_types',
    name: 'Record Types',
    description: 'Tenant-specific record type configurations',
    category: 'core',
    version: '2.0.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'tags',
    docsUrl: '/docs/modules/record-types',
  },

  // Phase 4 Modules (Delivery Entities)
  {
    key: 'cohorts',
    name: 'Cohorts',
    description: 'Programme cohort management',
    category: 'delivery',
    version: '2.1.0',
    required: false,
    dependencies: ['programmes'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'users',
    docsUrl: '/docs/modules/cohorts',
  },
  {
    key: 'sessions',
    name: 'Sessions',
    description: 'Programme session scheduling and management',
    category: 'delivery',
    version: '2.1.0',
    required: false,
    dependencies: ['programmes', 'cohorts'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'calendar-day',
    docsUrl: '/docs/modules/sessions',
  },
  {
    key: 'attendance',
    name: 'Attendance',
    description: 'Session attendance tracking',
    category: 'delivery',
    version: '2.1.0',
    required: false,
    dependencies: ['sessions'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'clipboard-check',
    docsUrl: '/docs/modules/attendance',
  },

  // Phase 5 Modules (Compliance)
  {
    key: 'outcomes',
    name: 'Outcomes',
    description: 'Outcome framework tracking and reporting',
    category: 'compliance',
    version: '2.2.0',
    required: false,
    dependencies: ['programmes', 'students'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'chart-network',
    docsUrl: '/docs/modules/outcomes',
  },
  {
    key: 'safeguarding',
    name: 'Safeguarding',
    description: 'Safeguarding notes and access control',
    category: 'compliance',
    version: '2.2.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: false,
    icon: 'shield-alt',
    docsUrl: '/docs/modules/safeguarding',
  },
  {
    key: 'consent',
    name: 'Consent',
    description: 'Consent record management',
    category: 'compliance',
    version: '2.2.0',
    required: false,
    dependencies: ['contacts'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'file-signature',
    docsUrl: '/docs/modules/consent',
  },
  {
    key: 'attachments',
    name: 'Attachments',
    description: 'File attachment management',
    category: 'core',
    version: '2.2.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: false,
    icon: 'paperclip',
    docsUrl: '/docs/modules/attachments',
  },

  // Phase 6 Modules (Advanced Analytics)
  {
    key: 'advanced_reports',
    name: 'Advanced Reports',
    description: 'Advanced reporting and data visualization',
    category: 'analytics',
    version: '2.3.0',
    required: false,
    dependencies: ['reports'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'chart-pie',
    docsUrl: '/docs/modules/advanced-reports',
  },
  {
    key: 'dashboards',
    name: 'Dashboards',
    description: 'Customizable data dashboards',
    category: 'analytics',
    version: '2.3.0',
    required: false,
    dependencies: ['reports'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'tachometer-alt',
    docsUrl: '/docs/modules/dashboards',
  },

  // Phase 7 Modules (Automation)
  {
    key: 'automation',
    name: 'Automation',
    description: 'Workflow automation rules',
    category: 'automation',
    version: '2.4.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: false,
    icon: 'robot',
    docsUrl: '/docs/modules/automation',
  },
  {
    key: 'field_history',
    name: 'Field History',
    description: 'Track field-level changes over time',
    category: 'automation',
    version: '2.4.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: false,
    icon: 'history',
    docsUrl: '/docs/modules/field-history',
  },

  // Phase 8 Modules (Integrations)
  {
    key: 'gmail',
    name: 'Gmail',
    description: 'Gmail integration for email campaigns',
    category: 'integrations',
    version: '2.5.0',
    required: false,
    dependencies: ['outreach'],
    conflicts: [],
    defaultEnabled: true,
    icon: 'envelope',
    docsUrl: '/docs/modules/gmail',
  },
  {
    key: 'import_export',
    name: 'Import/Export',
    description: 'Data import and export functionality',
    category: 'integrations',
    version: '2.5.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'file-import',
    docsUrl: '/docs/modules/import-export',
  },

  // LMS Module
  {
    key: 'lms',
    name: 'Learner Management System',
    description: 'Student enrolment, coach data entry, impact calculation, and report generation',
    category: 'delivery',
    version: '3.0.0',
    required: false,
    dependencies: ['organisations', 'cohorts'],
    conflicts: [],
    defaultEnabled: false,
    icon: 'graduation-cap',
    docsUrl: '/docs/modules/lms',
  },

  // Phase 10: AI Module
  {
    key: 'ai',
    name: 'AI & Intelligence',
    description: 'AI-powered features: email composer, lead scoring, contact summaries, next best action, and navigation helper',
    category: 'automation',
    version: '4.0.0',
    required: false,
    dependencies: [],
    conflicts: [],
    defaultEnabled: true,
    icon: 'sparkles',
    docsUrl: '/docs/modules/ai',
  },
];

/**
 * Get module definition by key
 */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find(module => module.key === key);
}

/**
 * Get all module definitions in a category
 */
export function getModulesByCategory(category: ModuleCategory): ModuleDefinition[] {
  return MODULE_DEFINITIONS.filter(module => module.category === category);
}

/**
 * Get all module keys
 */
export function getAllModuleKeys(): string[] {
  return MODULE_DEFINITIONS.map(module => module.key);
}

/**
 * Get modules that are required (cannot be disabled)
 */
export function getRequiredModules(): ModuleDefinition[] {
  return MODULE_DEFINITIONS.filter(module => module.required);
}

/**
 * Get modules that are enabled by default for new tenants
 */
export function getDefaultEnabledModules(): ModuleDefinition[] {
  return MODULE_DEFINITIONS.filter(module => module.defaultEnabled);
}

/**
 * Validate if a module can be enabled based on dependencies
 * Returns array of missing dependency keys
 */
export function validateModuleDependencies(moduleKey: string, enabledModules: string[]): string[] {
  const module = getModuleDefinition(moduleKey);
  if (!module) return [];

  const missingDeps: string[] = [];
  for (const dep of module.dependencies) {
    if (!enabledModules.includes(dep)) {
      missingDeps.push(dep);
    }
  }
  return missingDeps;
}

/**
 * Validate if a module can be disabled based on dependents
 * Returns array of modules that depend on this module
 */
export function validateModuleDependents(moduleKey: string, enabledModules: string[]): string[] {
  const dependents: string[] = [];
  for (const module of MODULE_DEFINITIONS) {
    if (enabledModules.includes(module.key) && module.dependencies.includes(moduleKey)) {
      dependents.push(module.key);
    }
  }
  return dependents;
}

/**
 * Get the full dependency tree for a module (including transitive dependencies)
 */
export function getDependencyTree(moduleKey: string): string[] {
  const module = getModuleDefinition(moduleKey);
  if (!module) return [];

  const dependencies = new Set<string>();
  const queue = [...module.dependencies];

  while (queue.length > 0) {
    const depKey = queue.shift()!;
    if (dependencies.has(depKey)) continue;

    dependencies.add(depKey);
    const depModule = getModuleDefinition(depKey);
    if (depModule) {
      queue.push(...depModule.dependencies.filter(d => !dependencies.has(d)));
    }
  }

  return Array.from(dependencies);
}

/**
 * Get module enablement order (topological sort based on dependencies)
 */
export function getModuleEnablementOrder(): string[] {
  const modules = [...MODULE_DEFINITIONS];
  const result: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(key: string): boolean {
    if (temp.has(key)) return false; // Cycle detected
    if (visited.has(key)) return true;

    temp.add(key);
    const module = getModuleDefinition(key);
    if (module) {
      for (const dep of module.dependencies) {
        if (!visit(dep)) return false;
      }
    }
    temp.delete(key);
    visited.add(key);
    result.push(key);
    return true;
  }

  for (const module of modules) {
    if (!visited.has(module.key)) {
      if (!visit(module.key)) {
        throw new Error(`Cyclic dependency detected in module definitions`);
      }
    }
  }

  return result;
}