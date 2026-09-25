-- Migration: Create all Yes Futures (YF) domain tables
-- These tables were previously pushed via drizzle-kit push with no migration file.
-- This migration makes the schema reproducible on any fresh database.

-- UP MIGRATION
-- ============

CREATE TABLE IF NOT EXISTS "yf_trusts" (
  "id" text PRIMARY KEY NOT NULL,
  "trust_name" text NOT NULL,
  "trust_type" text,
  "ceo" text,
  "education_lead" text,
  "safeguarding_lead" text,
  "head_office_address" text,
  "postcode" text,
  "region" text,
  "website" text,
  "phone" text,
  "email" text,
  "number_of_schools" integer DEFAULT 0,
  "relationship_status" text DEFAULT 'PROSPECT',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_schools" (
  "id" text PRIMARY KEY NOT NULL,
  "trust_id" text REFERENCES "yf_trusts"("id"),
  "school_name" text NOT NULL,
  "urn" text,
  "phase" text,
  "address" text,
  "postcode" text,
  "website" text,
  "phone" text,
  "headteacher" text,
  "dsl" text,
  "senco" text,
  "head_of_sixth_form" text,
  "careers_lead" text,
  "relationship_status" text DEFAULT 'PROSPECT',
  "delivery_status" text DEFAULT 'NONE',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text,
  CONSTRAINT "yf_schools_urn_unique" UNIQUE("urn")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_sponsors" (
  "id" text PRIMARY KEY NOT NULL,
  "organisation_name" text NOT NULL,
  "sector" text,
  "website" text,
  "csr_priority" text,
  "employee_volunteering_interest" boolean DEFAULT false,
  "relationship_status" text DEFAULT 'PROSPECT',
  "region" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "school_id" text REFERENCES "yf_schools"("id"),
  "trust_id" text REFERENCES "yf_trusts"("id"),
  "sponsor_id" text REFERENCES "yf_sponsors"("id"),
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "job_title" text,
  "department" text,
  "email" text,
  "phone" text,
  "preferred_contact_method" text,
  "is_decision_maker" boolean DEFAULT false,
  "is_first_outreach_contact" boolean DEFAULT false,
  "is_delivery_contact" boolean DEFAULT false,
  "is_safeguarding_relevant" boolean DEFAULT false,
  "year_groups_relevant" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_funding_opportunities" (
  "id" text PRIMARY KEY NOT NULL,
  "sponsor_id" text NOT NULL REFERENCES "yf_sponsors"("id"),
  "funding_type" text,
  "amount" real,
  "stage" text DEFAULT 'PROSPECT',
  "renewal_date" text,
  "reporting_required" boolean DEFAULT false,
  "reporting_deadline" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_programmes" (
  "id" text PRIMARY KEY NOT NULL,
  "school_id" text NOT NULL REFERENCES "yf_schools"("id"),
  "funding_opportunity_id" text REFERENCES "yf_funding_opportunities"("id"),
  "programme_name" text NOT NULL,
  "programme_type" text,
  "year_group" text,
  "start_date" text,
  "end_date" text,
  "status" text DEFAULT 'PLANNED',
  "student_count" integer DEFAULT 0,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_students" (
  "id" text PRIMARY KEY NOT NULL,
  "school_id" text NOT NULL REFERENCES "yf_schools"("id"),
  "programme_id" text REFERENCES "yf_programmes"("id"),
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "year_group" text,
  "consent_status" text DEFAULT 'PENDING',
  "attendance_count" integer DEFAULT 0,
  "safeguarding_flag" boolean DEFAULT false,
  "support_notes" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_volunteers" (
  "id" text PRIMARY KEY NOT NULL,
  "sponsor_id" text REFERENCES "yf_sponsors"("id"),
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text,
  "phone" text,
  "dbs_status" text DEFAULT 'NOT_STARTED',
  "dbs_expiry" text,
  "safeguarding_training_date" text,
  "skills" text,
  "availability" text,
  "assigned_coordinator" text,
  "status" text DEFAULT 'PENDING',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_placements" (
  "id" text PRIMARY KEY NOT NULL,
  "volunteer_id" text NOT NULL REFERENCES "yf_volunteers"("id"),
  "programme_id" text NOT NULL REFERENCES "yf_programmes"("id"),
  "start_date" text,
  "end_date" text,
  "hours_delivered" real DEFAULT 0,
  "status" text DEFAULT 'CONFIRMED',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "yf_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "activity_type" text,
  "date" text NOT NULL,
  "owner_id" text NOT NULL,
  "subject" text NOT NULL,
  "notes" text,
  "next_action" text,
  "next_action_date" text,
  "linked_record_type" text,
  "linked_trust_id" text,
  "linked_school_id" text,
  "linked_sponsor_id" text,
  "linked_volunteer_id" text,
  "linked_student_id" text,
  "linked_programme_id" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" text
);
