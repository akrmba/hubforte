export interface FieldMapping {
  csvColumn: string;
  crmField: string;
}

export interface MappingPreset {
  name: string;
  slug: string;
  description: string;
  entityMappings: Record<string, FieldMapping[]>;
}

const salesforce: MappingPreset = {
  name: "Salesforce",
  slug: "salesforce",
  description: "Standard Salesforce export column names",
  entityMappings: {
    organizations: [
      { csvColumn: "Account Name", crmField: "name" },
      { csvColumn: "Account Type", crmField: "type" },
      { csvColumn: "Phone", crmField: "phone" },
      { csvColumn: "Website", crmField: "website" },
      { csvColumn: "Billing Street", crmField: "address" },
      { csvColumn: "Billing Zip/Postal Code", crmField: "postcode" },
      { csvColumn: "Description", crmField: "notes" },
      { csvColumn: "Account Status", crmField: "status" },
    ],
    contacts: [
      { csvColumn: "First Name", crmField: "firstName" },
      { csvColumn: "Last Name", crmField: "lastName" },
      { csvColumn: "Email", crmField: "email" },
      { csvColumn: "Phone", crmField: "phone" },
      { csvColumn: "Title", crmField: "role" },
      { csvColumn: "Account Name", crmField: "organizationName" },
      { csvColumn: "Description", crmField: "notes" },
    ],
    deals: [
      { csvColumn: "Opportunity Name", crmField: "title" },
      { csvColumn: "Amount", crmField: "value" },
      { csvColumn: "Stage", crmField: "stage" },
      { csvColumn: "Close Date", crmField: "expectedCloseDate" },
      { csvColumn: "Account Name", crmField: "organizationName" },
      { csvColumn: "Description", crmField: "notes" },
    ],
    activities: [
      { csvColumn: "Subject", crmField: "subject" },
      { csvColumn: "Activity Type", crmField: "activityType" },
      { csvColumn: "Due Date", crmField: "dueDate" },
      { csvColumn: "Status", crmField: "status" },
      { csvColumn: "Description", crmField: "notes" },
      { csvColumn: "Name", crmField: "contactName" },
    ],
  },
};

const hubspot: MappingPreset = {
  name: "HubSpot",
  slug: "hubspot",
  description: "Standard HubSpot export column names",
  entityMappings: {
    organizations: [
      { csvColumn: "Company name", crmField: "name" },
      { csvColumn: "Company Domain Name", crmField: "website" },
      { csvColumn: "Phone Number", crmField: "phone" },
      { csvColumn: "Postal Code", crmField: "postcode" },
      { csvColumn: "Street Address", crmField: "address" },
      { csvColumn: "Description", crmField: "notes" },
    ],
    contacts: [
      { csvColumn: "First Name", crmField: "firstName" },
      { csvColumn: "Last Name", crmField: "lastName" },
      { csvColumn: "Email", crmField: "email" },
      { csvColumn: "Phone Number", crmField: "phone" },
      { csvColumn: "Job Title", crmField: "role" },
      { csvColumn: "Associated Company", crmField: "organizationName" },
    ],
    deals: [
      { csvColumn: "Deal Name", crmField: "title" },
      { csvColumn: "Amount", crmField: "value" },
      { csvColumn: "Deal Stage", crmField: "stage" },
      { csvColumn: "Close Date", crmField: "expectedCloseDate" },
      { csvColumn: "Associated Company", crmField: "organizationName" },
      { csvColumn: "Deal Description", crmField: "notes" },
    ],
    activities: [
      { csvColumn: "Activity Type", crmField: "activityType" },
      { csvColumn: "Activity Title", crmField: "subject" },
      { csvColumn: "Activity Date", crmField: "dueDate" },
      { csvColumn: "Notes", crmField: "notes" },
    ],
  },
};

const pipedrive: MappingPreset = {
  name: "Pipedrive",
  slug: "pipedrive",
  description: "Standard Pipedrive export column names",
  entityMappings: {
    organizations: [
      { csvColumn: "Organization", crmField: "name" },
      { csvColumn: "Organization - Address", crmField: "address" },
      { csvColumn: "Organization - Phone", crmField: "phone" },
    ],
    contacts: [
      { csvColumn: "Person - First name", crmField: "firstName" },
      { csvColumn: "Person - Last name", crmField: "lastName" },
      { csvColumn: "Person - Email", crmField: "email" },
      { csvColumn: "Person - Phone", crmField: "phone" },
      { csvColumn: "Organization", crmField: "organizationName" },
    ],
    deals: [
      { csvColumn: "Deal - Title", crmField: "title" },
      { csvColumn: "Deal - Value", crmField: "value" },
      { csvColumn: "Deal - Stage", crmField: "stage" },
      { csvColumn: "Deal - Expected close date", crmField: "expectedCloseDate" },
      { csvColumn: "Organization", crmField: "organizationName" },
    ],
    activities: [
      { csvColumn: "Subject", crmField: "subject" },
      { csvColumn: "Type", crmField: "activityType" },
      { csvColumn: "Due date", crmField: "dueDate" },
      { csvColumn: "Note", crmField: "notes" },
    ],
  },
};

const zoho: MappingPreset = {
  name: "Zoho CRM",
  slug: "zoho",
  description: "Standard Zoho CRM export column names",
  entityMappings: {
    organizations: [
      { csvColumn: "Account Name", crmField: "name" },
      { csvColumn: "Phone", crmField: "phone" },
      { csvColumn: "Website", crmField: "website" },
      { csvColumn: "Billing Street", crmField: "address" },
      { csvColumn: "Billing Code", crmField: "postcode" },
      { csvColumn: "Description", crmField: "notes" },
    ],
    contacts: [
      { csvColumn: "First Name", crmField: "firstName" },
      { csvColumn: "Last Name", crmField: "lastName" },
      { csvColumn: "Email", crmField: "email" },
      { csvColumn: "Phone", crmField: "phone" },
      { csvColumn: "Title", crmField: "role" },
      { csvColumn: "Account Name", crmField: "organizationName" },
    ],
    deals: [
      { csvColumn: "Deal Name", crmField: "title" },
      { csvColumn: "Amount", crmField: "value" },
      { csvColumn: "Stage", crmField: "stage" },
      { csvColumn: "Closing Date", crmField: "expectedCloseDate" },
      { csvColumn: "Account Name", crmField: "organizationName" },
      { csvColumn: "Description", crmField: "notes" },
    ],
    activities: [
      { csvColumn: "Subject", crmField: "subject" },
      { csvColumn: "Activity Type", crmField: "activityType" },
      { csvColumn: "Due Date", crmField: "dueDate" },
      { csvColumn: "Description", crmField: "notes" },
    ],
  },
};

const generic: MappingPreset = {
  name: "Generic CSV",
  slug: "generic",
  description: "Common column names found in most CSV exports",
  entityMappings: {
    organizations: [
      { csvColumn: "name", crmField: "name" },
      { csvColumn: "company", crmField: "name" },
      { csvColumn: "organization", crmField: "name" },
      { csvColumn: "phone", crmField: "phone" },
      { csvColumn: "website", crmField: "website" },
      { csvColumn: "address", crmField: "address" },
      { csvColumn: "postcode", crmField: "postcode" },
      { csvColumn: "zip", crmField: "postcode" },
      { csvColumn: "notes", crmField: "notes" },
    ],
    contacts: [
      { csvColumn: "first_name", crmField: "firstName" },
      { csvColumn: "first name", crmField: "firstName" },
      { csvColumn: "firstname", crmField: "firstName" },
      { csvColumn: "last_name", crmField: "lastName" },
      { csvColumn: "last name", crmField: "lastName" },
      { csvColumn: "lastname", crmField: "lastName" },
      { csvColumn: "email", crmField: "email" },
      { csvColumn: "phone", crmField: "phone" },
      { csvColumn: "role", crmField: "role" },
      { csvColumn: "title", crmField: "role" },
      { csvColumn: "job_title", crmField: "role" },
      { csvColumn: "company", crmField: "organizationName" },
      { csvColumn: "organization", crmField: "organizationName" },
    ],
    deals: [
      { csvColumn: "title", crmField: "title" },
      { csvColumn: "name", crmField: "title" },
      { csvColumn: "deal", crmField: "title" },
      { csvColumn: "value", crmField: "value" },
      { csvColumn: "amount", crmField: "value" },
      { csvColumn: "stage", crmField: "stage" },
      { csvColumn: "close_date", crmField: "expectedCloseDate" },
      { csvColumn: "close date", crmField: "expectedCloseDate" },
      { csvColumn: "notes", crmField: "notes" },
    ],
    activities: [
      { csvColumn: "subject", crmField: "subject" },
      { csvColumn: "type", crmField: "activityType" },
      { csvColumn: "due_date", crmField: "dueDate" },
      { csvColumn: "due date", crmField: "dueDate" },
      { csvColumn: "notes", crmField: "notes" },
    ],
  },
};

export const IMPORT_PRESETS: MappingPreset[] = [salesforce, hubspot, pipedrive, zoho, generic];

export function getPreset(slug: string): MappingPreset | undefined {
  return IMPORT_PRESETS.find(p => p.slug === slug);
}

export function autoMapHeaders(headers: string[], entityType: string, presetSlug?: string): FieldMapping[] {
  const preset = presetSlug ? getPreset(presetSlug) : undefined;
  const mappings: FieldMapping[] = [];
  const mapped = new Set<string>();

  for (const header of headers) {
    const headerLower = header.toLowerCase().trim();
    let match: string | undefined;

    if (preset) {
      const presetMappings = preset.entityMappings[entityType] || [];
      const found = presetMappings.find(m => m.csvColumn.toLowerCase() === headerLower);
      if (found && !mapped.has(found.crmField)) {
        match = found.crmField;
      }
    }

    if (!match) {
      const genericMappings = generic.entityMappings[entityType] || [];
      const found = genericMappings.find(m => m.csvColumn.toLowerCase() === headerLower);
      if (found && !mapped.has(found.crmField)) {
        match = found.crmField;
      }
    }

    if (match) {
      mapped.add(match);
      mappings.push({ csvColumn: header, crmField: match });
    }
  }

  return mappings;
}

export const ENTITY_REQUIRED_FIELDS: Record<string, string[]> = {
  contacts: ["firstName", "lastName"],
  organizations: ["name"],
  volunteers: [],
  students: ["firstName", "lastName", "organizationName"],
};

export const ENTITY_FIELDS: Record<string, string[]> = {
  contacts: ["firstName", "lastName", "email", "phone", "mobile", "role", "department", "organizationName", "notes", "status"],
  organizations: ["name", "type", "phone", "website", "address", "postcode", "region", "country", "notes", "status"],
  volunteers: ["firstName", "lastName", "email", "phone", "postcode", "region", "employer", "industryBackground"],
  students: ["firstName", "lastName", "organizationName", "yearGroup", "gender", "postcodePrefix", "primaryNeed", "referralReason", "referralSource", "referralDate"],
  deals: ["title", "value", "stage", "expectedCloseDate", "organizationName", "notes"],
  activities: ["subject", "activityType", "dueDate", "status", "notes", "contactName"],
};
