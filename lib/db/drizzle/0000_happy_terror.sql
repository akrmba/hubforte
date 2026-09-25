-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."activity_type" AS ENUM('EMAIL', 'CALL', 'NOTE', 'MEETING', 'TASK_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('ACTIVE', 'INACTIVE', 'PROSPECT', 'UNSUBSCRIBED');--> statement-breakpoint
CREATE TYPE "public"."dbs_status" AS ENUM('CLEAR', 'PENDING', 'EXPIRED', 'NOT_CHECKED');--> statement-breakpoint
CREATE TYPE "public"."funder_status" AS ENUM('ACTIVE', 'INACTIVE', 'PROSPECT');--> statement-breakpoint
CREATE TYPE "public"."funder_type" AS ENUM('TRUST', 'FOUNDATION', 'CORPORATE', 'GOVERNMENT', 'INDIVIDUAL', 'LOTTERY');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('PROSPECT', 'APPROACH', 'APPLIED', 'AWARDED', 'DECLINED', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('ACTIVE', 'INACTIVE', 'PROSPECT');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('SCHOOL', 'COMPANY', 'TRUST', 'CHARITY', 'GOVERNMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."remediation_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'REPLIED', 'UNSUBSCRIBED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('MANUAL', 'EMAIL', 'VOICE');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"password_hash" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "role" DEFAULT 'OPERATOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"gmail_refresh_token" text,
	"invite_token" text,
	"invite_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "org_type" NOT NULL,
	"status" "org_status" DEFAULT 'PROSPECT' NOT NULL,
	"location" text,
	"owner_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" text,
	"email" text NOT NULL,
	"phone" text,
	"status" "contact_status" DEFAULT 'PROSPECT' NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"owner_id" text NOT NULL,
	"contact_id" text,
	"organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "activity_type" NOT NULL,
	"summary" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"contact_id" text,
	"organization_id" text,
	"opportunity_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"author_id" text NOT NULL,
	"contact_id" text,
	"organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"variables" text[] DEFAULT '{""}' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"status" "send_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_template" text NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	"route" text,
	"user_id" text,
	"request_id" text,
	"stack" text,
	"plain_english" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_note" text
);
--> statement-breakpoint
CREATE TABLE "gmail_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"contact_id" text,
	"user_id" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_snapshot" text NOT NULL,
	"status" "send_status" NOT NULL,
	"gmail_message_id" text,
	"gmail_thread_id" text,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attachments" jsonb
);
--> statement-breakpoint
CREATE TABLE "volunteers" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"dbs_status" "dbs_status" DEFAULT 'NOT_CHECKED' NOT NULL,
	"dbs_checked_at" timestamp with time zone,
	"dbs_expires_at" timestamp with time zone,
	"availability" text,
	"skills" text[] DEFAULT '{""}' NOT NULL,
	"references" text[] DEFAULT '{""}' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "volunteers_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
CREATE TABLE "funder_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"funder_id" text NOT NULL,
	"contact_id" text NOT NULL,
	CONSTRAINT "funder_contacts_funder_id_contact_id_unique" UNIQUE("funder_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "funders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "funder_type" NOT NULL,
	"funding_areas" text[] DEFAULT '{""}' NOT NULL,
	"typical_grant_min" integer,
	"typical_grant_max" integer,
	"application_deadlines" text,
	"relationship_owner_id" text NOT NULL,
	"website" text,
	"notes" text,
	"status" "funder_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"value" numeric(15, 2),
	"stage" "opportunity_stage" DEFAULT 'PROSPECT' NOT NULL,
	"funder_id" text,
	"organization_id" text,
	"owner_id" text NOT NULL,
	"expected_close_date" timestamp with time zone,
	"actual_close_date" timestamp with time zone,
	"description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"activity_id" text NOT NULL,
	CONSTRAINT "opportunity_activities_opportunity_id_activity_id_unique" UNIQUE("opportunity_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_ticket_diagnoses" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"diagnosis" text NOT NULL,
	"suggested_action" text NOT NULL,
	"confidence" text NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"source" "ticket_source" DEFAULT 'MANUAL' NOT NULL,
	"reported_by_id" text NOT NULL,
	"assigned_to_id" text,
	"contact_id" text,
	"organization_id" text,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "ticket_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"trigger" text NOT NULL,
	"action" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"max_auto_runs_per_day" integer DEFAULT 0 NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remediation_policies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "remediation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"triggered_by_id" text,
	"status" "remediation_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'INFO' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"user_id" text,
	"slow_request" boolean DEFAULT false,
	"is_error" boolean DEFAULT false,
	"is_critical" boolean DEFAULT false,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "feature_flags_module_unique" UNIQUE("module")
);
--> statement-breakpoint
CREATE INDEX "request_logs_slow_request_idx" ON "request_logs" USING btree ("slow_request" bool_ops);--> statement-breakpoint
CREATE INDEX "request_logs_status_code_idx" ON "request_logs" USING btree ("status_code" int4_ops);--> statement-breakpoint
CREATE INDEX "request_logs_timestamp_idx" ON "request_logs" USING btree ("timestamp" timestamp_ops);--> statement-breakpoint
CREATE INDEX "request_logs_user_id_idx" ON "request_logs" USING btree ("user_id" text_ops);
*/