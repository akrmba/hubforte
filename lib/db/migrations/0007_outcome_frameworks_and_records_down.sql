-- Migration: Drop outcome_frameworks and outcome_records tables

DROP TABLE IF EXISTS outcome_records;
DROP TABLE IF EXISTS outcome_frameworks;

DROP TYPE IF EXISTS outcome_record_status;
DROP TYPE IF EXISTS assessment_type;
DROP TYPE IF EXISTS outcome_framework_status;
DROP TYPE IF EXISTS scoring_method;