-- DOWN MIGRATION: Drop all Yes Futures (YF) domain tables
-- Reverse of 0001_yf_tables.sql
-- Tables dropped in reverse dependency order to respect foreign keys.

DROP TABLE IF EXISTS "yf_activities";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_placements";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_students";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_volunteers";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_programmes";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_funding_opportunities";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_contacts";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_schools";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_sponsors";--> statement-breakpoint
DROP TABLE IF EXISTS "yf_trusts";
