-- Phase 6: Reporting Engine - Drop reporting tables
-- Migration: 0011_reporting_tables_down.sql

DROP INDEX IF EXISTS idx_dashboards_sharing;
DROP INDEX IF EXISTS idx_dashboards_owner;
DROP INDEX IF EXISTS idx_dashboards_tenant;
DROP INDEX IF EXISTS idx_saved_reports_sharing;
DROP INDEX IF EXISTS idx_saved_reports_owner;
DROP INDEX IF EXISTS idx_saved_reports_tenant;
DROP INDEX IF EXISTS idx_report_types_entity;
DROP INDEX IF EXISTS idx_report_types_tenant;

DROP TABLE IF EXISTS dashboards;
DROP TABLE IF EXISTS saved_reports;
DROP TABLE IF EXISTS report_types;
