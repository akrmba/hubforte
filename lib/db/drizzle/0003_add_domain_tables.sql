-- Migration: Add domain tables (programmes, students, placements)
-- These tables exist in the Drizzle schema but were missing from the database.

-- UP MIGRATION
-- ============

CREATE TABLE IF NOT EXISTS "programmes" (
  "id" text PRIMARY KEY NOT NULL,
  "school_id" text NOT NULL,
  "funding_opportunity_id" text,
  "programme_name" text NOT NULL,
  "programme_type" text,
  "year_group" text,
  "start_date" text,
  "end_date" text,
  "status" text DEFAULT 'PLANNED',
  "student_count" integer DEFAULT 0,
  "notes" text,
  "created_by" text,
  "source_table" text,
  "source_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "students" (
  "id" text PRIMARY KEY NOT NULL,
  "school_id" text NOT NULL,
  "programme_id" text,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "year_group" text,
  "consent_status" text DEFAULT 'PENDING',
  "attendance_count" integer DEFAULT 0,
  "safeguarding_flag" boolean DEFAULT false,
  "support_notes" text,
  "notes" text,
  "created_by" text,
  "source_table" text,
  "source_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "placements" (
  "id" text PRIMARY KEY NOT NULL,
  "volunteer_id" text NOT NULL,
  "programme_id" text NOT NULL,
  "start_date" text,
  "end_date" text,
  "hours_delivered" real DEFAULT 0,
  "status" text DEFAULT 'CONFIRMED',
  "notes" text,
  "created_by" text,
  "source_table" text,
  "source_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
