-- DOWN MIGRATION: Drop domain tables added by 0003_add_domain_tables.sql
-- Reverse dependency order: placements references programmes and volunteers,
-- students references programmes, programmes is standalone.

DROP TABLE IF EXISTS "placements";
DROP TABLE IF EXISTS "students";
DROP TABLE IF EXISTS "programmes";
