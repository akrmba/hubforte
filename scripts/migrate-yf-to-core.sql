-- Hubforte Data Migration: yf_* tables → core tables
-- Date: 2026-04-15
-- Run order: This script must be run in sequence (FK dependencies)
-- Rollback: DELETE FROM {table} WHERE source_table = 'yf_{entity}'
-- All new rows get fresh UUIDs via gen_random_uuid()

-- ============================================================
-- PRE-FLIGHT: Capture row counts for validation
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '=== PRE-MIGRATION ROW COUNTS ===';
  RAISE NOTICE 'yf_trusts: %', (SELECT count(*) FROM yf_trusts);
  RAISE NOTICE 'yf_schools: %', (SELECT count(*) FROM yf_schools);
  RAISE NOTICE 'yf_sponsors: %', (SELECT count(*) FROM yf_sponsors);
  RAISE NOTICE 'yf_contacts: %', (SELECT count(*) FROM yf_contacts);
  RAISE NOTICE 'yf_funding_opportunities: %', (SELECT count(*) FROM yf_funding_opportunities);
  RAISE NOTICE 'yf_programmes: %', (SELECT count(*) FROM yf_programmes);
  RAISE NOTICE 'yf_students: %', (SELECT count(*) FROM yf_students);
  RAISE NOTICE 'yf_volunteers: %', (SELECT count(*) FROM yf_volunteers);
  RAISE NOTICE 'yf_placements: %', (SELECT count(*) FROM yf_placements);
  RAISE NOTICE 'yf_activities: %', (SELECT count(*) FROM yf_activities);
END $$;

-- ============================================================
-- STEP 1: Migrate yf_trusts → organizations (type=TRUST)
-- ============================================================
INSERT INTO organizations (
  id, tenant_id, name, type, status, address, postcode, region, website, phone, email,
  trust_type, ceo, education_lead, safeguarding_lead, number_of_schools,
  relationship_status, notes, owner_id, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  t.tenant_id,
  t.trust_name,
  'TRUST',
  'ACTIVE',
  t.head_office_address,
  t.postcode,
  t.region,
  t.website,
  t.phone,
  t.email,
  t.trust_type,
  t.ceo,
  t.education_lead,
  t.safeguarding_lead,
  t.number_of_schools,
  t.relationship_status,
  t.notes,
  COALESCE(t.created_by, 'system'),
  'yf_trusts',
  t.id,
  t.created_by,
  t.created_at,
  t.updated_at
FROM yf_trusts t
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.source_table = 'yf_trusts' AND o.source_id = t.id
);

-- ============================================================
-- STEP 2: Migrate yf_schools → organizations (type=SCHOOL)
-- ============================================================
INSERT INTO organizations (
  id, tenant_id, name, type, status, address, postcode, website, phone,
  urn, phase, headteacher, dsl, senco, head_of_sixth_form, careers_lead,
  relationship_status, delivery_status, parent_org_id,
  notes, owner_id, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  s.tenant_id,
  s.school_name,
  'SCHOOL',
  'ACTIVE',
  s.address,
  s.postcode,
  s.website,
  s.phone,
  s.urn,
  s.phase,
  s.headteacher,
  s.dsl,
  s.senco,
  s.head_of_sixth_form,
  s.careers_lead,
  s.relationship_status,
  s.delivery_status,
  -- Resolve trust FK: find the org record created from this school's trust
  (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_trusts' AND o.source_id = s.trust_id LIMIT 1),
  s.notes,
  COALESCE(s.created_by, 'system'),
  'yf_schools',
  s.id,
  s.created_by,
  s.created_at,
  s.updated_at
FROM yf_schools s
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.source_table = 'yf_schools' AND o.source_id = s.id
);

-- ============================================================
-- STEP 3: Migrate yf_sponsors → organizations (type=SPONSOR)
-- ============================================================
INSERT INTO organizations (
  id, tenant_id, name, type, status, sector, website, csr_priority,
  employee_volunteering_interest, relationship_status, region,
  notes, owner_id, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  sp.tenant_id,
  sp.organisation_name,
  'SPONSOR',
  'ACTIVE',
  sp.sector,
  sp.website,
  sp.csr_priority,
  sp.employee_volunteering_interest,
  sp.relationship_status,
  sp.region,
  sp.notes,
  COALESCE(sp.created_by, 'system'),
  'yf_sponsors',
  sp.id,
  sp.created_by,
  sp.created_at,
  sp.updated_at
FROM yf_sponsors sp
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.source_table = 'yf_sponsors' AND o.source_id = sp.id
);

-- ============================================================
-- STEP 4: Migrate yf_contacts → contacts
-- ============================================================
INSERT INTO contacts (
  id, tenant_id, first_name, last_name, role, department, email, phone,
  preferred_contact_method, is_decision_maker, is_first_outreach_contact,
  is_delivery_contact, is_safeguarding_relevant,
  organization_id, status, notes, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  c.tenant_id,
  c.first_name,
  c.last_name,
  c.job_title,
  c.department,
  c.email,
  c.phone,
  c.preferred_contact_method,
  c.is_decision_maker,
  c.is_first_outreach_contact,
  c.is_delivery_contact,
  c.is_safeguarding_relevant,
  -- Resolve org FK: school first, then trust, then sponsor
  COALESCE(
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_schools' AND o.source_id = c.school_id LIMIT 1),
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_trusts' AND o.source_id = c.trust_id LIMIT 1),
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_sponsors' AND o.source_id = c.sponsor_id LIMIT 1)
  ),
  'ACTIVE',
  c.notes,
  'yf_contacts',
  c.id,
  c.created_by,
  c.created_at,
  c.updated_at
FROM yf_contacts c
WHERE NOT EXISTS (
  SELECT 1 FROM contacts ct WHERE ct.source_table = 'yf_contacts' AND ct.source_id = c.id
);

-- ============================================================
-- STEP 5: Migrate yf_sponsors → funders
-- ============================================================
INSERT INTO funders (
  id, tenant_id, name, type, organization_id,
  sector, csr_priority, employee_volunteering_interest, region, website,
  relationship_status, relationship_owner_id,
  notes, status, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  sp.tenant_id,
  sp.organisation_name,
  'CSR',
  -- Link to the org record we created from this sponsor
  (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_sponsors' AND o.source_id = sp.id LIMIT 1),
  sp.sector,
  sp.csr_priority,
  sp.employee_volunteering_interest,
  sp.region,
  sp.website,
  CASE sp.relationship_status
    WHEN 'PROSPECT' THEN 'PROSPECT'
    WHEN 'CONTACTED' THEN 'CONTACTED'
    WHEN 'MEETING_HELD' THEN 'MEETING_HELD'
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'LAPSED' THEN 'LAPSED'
    ELSE 'PROSPECT'
  END,
  COALESCE(sp.created_by, 'system'),
  sp.notes,
  'ACTIVE',
  'yf_sponsors',
  sp.id,
  sp.created_by,
  sp.created_at,
  sp.updated_at
FROM yf_sponsors sp
WHERE NOT EXISTS (
  SELECT 1 FROM funders f WHERE f.source_table = 'yf_sponsors' AND f.source_id = sp.id
);

-- ============================================================
-- STEP 6: Migrate yf_funding_opportunities → funding_opportunities
-- ============================================================
INSERT INTO funding_opportunities (
  id, tenant_id, funder_id, name,
  funding_type, amount_expected, stage,
  renewal_date, reporting_required, reporting_deadline,
  notes, owner_id, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  fo.tenant_id,
  -- Resolve funder FK
  (SELECT f.id FROM funders f WHERE f.source_table = 'yf_sponsors' AND f.source_id = fo.sponsor_id LIMIT 1),
  COALESCE(
    'Funding from ' || (SELECT sp.organisation_name FROM yf_sponsors sp WHERE sp.id = fo.sponsor_id),
    'Funding opportunity'
  ),
  CASE fo.funding_type
    WHEN 'GRANT' THEN 'GRANT'
    WHEN 'CSR' THEN 'CSR'
    WHEN 'CONTRACT' THEN 'CONTRACT'
    WHEN 'IN_KIND' THEN 'IN_KIND'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE 'OTHER'
  END,
  fo.amount::numeric(15,2),
  CASE fo.stage
    WHEN 'PROSPECT' THEN 'PROSPECT'
    WHEN 'PROPOSAL_SENT' THEN 'PROPOSAL_SENT'
    WHEN 'AGREED' THEN 'AWARDED'
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'DECLINED' THEN 'DECLINED'
    ELSE 'PROSPECT'
  END,
  fo.renewal_date,
  fo.reporting_required,
  fo.reporting_deadline,
  fo.notes,
  COALESCE(fo.created_by, 'system'),
  'yf_funding_opportunities',
  fo.id,
  fo.created_by,
  fo.created_at,
  fo.updated_at
FROM yf_funding_opportunities fo
WHERE NOT EXISTS (
  SELECT 1 FROM funding_opportunities fop WHERE fop.source_table = 'yf_funding_opportunities' AND fop.source_id = fo.id
);

-- ============================================================
-- STEP 7: Migrate yf_programmes → programmes
-- ============================================================
INSERT INTO programmes (
  id, tenant_id, organization_id, funding_opportunity_id,
  programme_name, programme_type, target_year_groups,
  start_date, end_date, status, actual_student_count,
  notes, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  p.tenant_id,
  -- Resolve school → org FK
  (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_schools' AND o.source_id = p.school_id LIMIT 1),
  -- Resolve funding opportunity FK
  (SELECT fop.id FROM funding_opportunities fop WHERE fop.source_table = 'yf_funding_opportunities' AND fop.source_id = p.funding_opportunity_id LIMIT 1),
  p.programme_name,
  p.programme_type,
  CASE WHEN p.year_group IS NOT NULL THEN ARRAY[p.year_group] ELSE NULL END,
  p.start_date,
  p.end_date,
  CASE p.status
    WHEN 'PLANNED' THEN 'PLANNED'
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE 'PLANNED'
  END,
  p.student_count,
  p.notes,
  'yf_programmes',
  p.id,
  p.created_by,
  p.created_at,
  p.updated_at
FROM yf_programmes p
WHERE NOT EXISTS (
  SELECT 1 FROM programmes pr WHERE pr.source_table = 'yf_programmes' AND pr.source_id = p.id
);

-- ============================================================
-- STEP 8: Migrate yf_students → students
-- ============================================================
INSERT INTO students (
  id, tenant_id, organization_id, programme_id,
  first_name, last_name, year_group,
  consent_status, attendance_count, safeguarding_flag, support_notes,
  notes, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  st.tenant_id,
  -- Resolve school → org FK
  (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_schools' AND o.source_id = st.school_id LIMIT 1),
  -- Resolve programme FK
  (SELECT pr.id FROM programmes pr WHERE pr.source_table = 'yf_programmes' AND pr.source_id = st.programme_id LIMIT 1),
  st.first_name,
  st.last_name,
  st.year_group,
  CASE st.consent_status
    WHEN 'OBTAINED' THEN 'OBTAINED'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'WITHDRAWN' THEN 'WITHDRAWN'
    WHEN 'NOT_REQUIRED' THEN 'NOT_REQUIRED'
    ELSE 'PENDING'
  END,
  st.attendance_count,
  st.safeguarding_flag,
  st.support_notes,
  st.notes,
  'yf_students',
  st.id,
  st.created_by,
  st.created_at,
  st.updated_at
FROM yf_students st
WHERE NOT EXISTS (
  SELECT 1 FROM students s WHERE s.source_table = 'yf_students' AND s.source_id = st.id
);

-- ============================================================
-- STEP 9: Migrate yf_volunteers → volunteers
-- ============================================================
INSERT INTO volunteers (
  id, tenant_id, organization_id,
  first_name, last_name, email, phone,
  dbs_status, dbs_expiry_date, safeguarding_training_date,
  skills, availability, assigned_coordinator_id,
  status, notes, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  v.tenant_id,
  -- Resolve sponsor → org FK
  (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_sponsors' AND o.source_id = v.sponsor_id LIMIT 1),
  v.first_name,
  v.last_name,
  v.email,
  v.phone,
  CASE v.dbs_status
    WHEN 'CLEAR' THEN 'CLEAR'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'EXPIRED' THEN 'EXPIRED'
    WHEN 'NOT_STARTED' THEN 'NOT_STARTED'
    ELSE 'NOT_CHECKED'
  END,
  v.dbs_expiry,
  v.safeguarding_training_date,
  -- Convert comma-separated skills text to array
  CASE WHEN v.skills IS NOT NULL AND v.skills != ''
    THEN string_to_array(v.skills, ',')
    ELSE ARRAY[]::text[]
  END,
  -- Convert availability text to jsonb
  CASE WHEN v.availability IS NOT NULL AND v.availability != ''
    THEN to_jsonb(v.availability)
    ELSE '{}'::jsonb
  END,
  v.assigned_coordinator,
  v.status,
  v.notes,
  'yf_volunteers',
  v.id,
  v.created_by,
  v.created_at,
  v.updated_at
FROM yf_volunteers v
WHERE NOT EXISTS (
  SELECT 1 FROM volunteers vol WHERE vol.source_table = 'yf_volunteers' AND vol.source_id = v.id
);

-- ============================================================
-- STEP 10: Migrate yf_placements → placements
-- ============================================================
INSERT INTO placements (
  id, tenant_id, volunteer_id, programme_id,
  start_date, end_date, hours_delivered, status,
  notes, source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  pl.tenant_id,
  -- Resolve volunteer FK
  (SELECT vol.id FROM volunteers vol WHERE vol.source_table = 'yf_volunteers' AND vol.source_id = pl.volunteer_id LIMIT 1),
  -- Resolve programme FK
  (SELECT pr.id FROM programmes pr WHERE pr.source_table = 'yf_programmes' AND pr.source_id = pl.programme_id LIMIT 1),
  pl.start_date,
  pl.end_date,
  pl.hours_delivered,
  CASE pl.status
    WHEN 'CONFIRMED' THEN 'CONFIRMED'
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'WITHDRAWN' THEN 'WITHDRAWN'
    ELSE 'CONFIRMED'
  END,
  pl.notes,
  'yf_placements',
  pl.id,
  pl.created_by,
  pl.created_at,
  pl.updated_at
FROM yf_placements pl
WHERE NOT EXISTS (
  SELECT 1 FROM placements p WHERE p.source_table = 'yf_placements' AND p.source_id = pl.id
);

-- ============================================================
-- STEP 11: Migrate yf_activities → activities
-- ============================================================
INSERT INTO activities (
  id, tenant_id, type, summary, date, user_id, subject, notes,
  next_action, next_action_date,
  organization_id, volunteer_id, student_id, programme_id,
  source_table, source_id,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  a.tenant_id,
  CASE a.activity_type
    WHEN 'CALL' THEN 'CALL'
    WHEN 'EMAIL' THEN 'EMAIL'
    WHEN 'MEETING' THEN 'MEETING'
    WHEN 'SITE_VISIT' THEN 'SITE_VISIT'
    WHEN 'WHATSAPP' THEN 'WHATSAPP'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE 'OTHER'
  END,
  COALESCE(a.subject, 'Activity'),
  a.date::timestamptz,
  a.owner_id,
  a.subject,
  a.notes,
  a.next_action,
  a.next_action_date,
  -- Resolve organization: trust, school, or sponsor
  COALESCE(
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_trusts' AND o.source_id = a.linked_trust_id LIMIT 1),
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_schools' AND o.source_id = a.linked_school_id LIMIT 1),
    (SELECT o.id FROM organizations o WHERE o.source_table = 'yf_sponsors' AND o.source_id = a.linked_sponsor_id LIMIT 1)
  ),
  -- Resolve volunteer
  (SELECT vol.id FROM volunteers vol WHERE vol.source_table = 'yf_volunteers' AND vol.source_id = a.linked_volunteer_id LIMIT 1),
  -- Resolve student
  (SELECT s.id FROM students s WHERE s.source_table = 'yf_students' AND s.source_id = a.linked_student_id LIMIT 1),
  -- Resolve programme
  (SELECT pr.id FROM programmes pr WHERE pr.source_table = 'yf_programmes' AND pr.source_id = a.linked_programme_id LIMIT 1),
  'yf_activities',
  a.id,
  a.created_by,
  a.created_at,
  a.updated_at
FROM yf_activities a
WHERE NOT EXISTS (
  SELECT 1 FROM activities act WHERE act.source_table = 'yf_activities' AND act.source_id = a.id
);

-- ============================================================
-- POST-FLIGHT: Validate row counts
-- ============================================================
DO $$
DECLARE
  v_trusts_src int; v_trusts_dst int;
  v_schools_src int; v_schools_dst int;
  v_sponsors_src int; v_sponsors_dst int;
  v_contacts_src int; v_contacts_dst int;
  v_funding_src int; v_funding_dst int;
  v_programmes_src int; v_programmes_dst int;
  v_students_src int; v_students_dst int;
  v_volunteers_src int; v_volunteers_dst int;
  v_placements_src int; v_placements_dst int;
  v_activities_src int; v_activities_dst int;
  v_funders_dst int;
BEGIN
  SELECT count(*) INTO v_trusts_src FROM yf_trusts;
  SELECT count(*) INTO v_trusts_dst FROM organizations WHERE source_table = 'yf_trusts';
  SELECT count(*) INTO v_schools_src FROM yf_schools;
  SELECT count(*) INTO v_schools_dst FROM organizations WHERE source_table = 'yf_schools';
  SELECT count(*) INTO v_sponsors_src FROM yf_sponsors;
  SELECT count(*) INTO v_sponsors_dst FROM organizations WHERE source_table = 'yf_sponsors';
  SELECT count(*) INTO v_contacts_src FROM yf_contacts;
  SELECT count(*) INTO v_contacts_dst FROM contacts WHERE source_table = 'yf_contacts';
  SELECT count(*) INTO v_funding_src FROM yf_funding_opportunities;
  SELECT count(*) INTO v_funding_dst FROM funding_opportunities WHERE source_table = 'yf_funding_opportunities';
  SELECT count(*) INTO v_programmes_src FROM yf_programmes;
  SELECT count(*) INTO v_programmes_dst FROM programmes WHERE source_table = 'yf_programmes';
  SELECT count(*) INTO v_students_src FROM yf_students;
  SELECT count(*) INTO v_students_dst FROM students WHERE source_table = 'yf_students';
  SELECT count(*) INTO v_volunteers_src FROM yf_volunteers;
  SELECT count(*) INTO v_volunteers_dst FROM volunteers WHERE source_table = 'yf_volunteers';
  SELECT count(*) INTO v_placements_src FROM yf_placements;
  SELECT count(*) INTO v_placements_dst FROM placements WHERE source_table = 'yf_placements';
  SELECT count(*) INTO v_activities_src FROM yf_activities;
  SELECT count(*) INTO v_activities_dst FROM activities WHERE source_table = 'yf_activities';
  SELECT count(*) INTO v_funders_dst FROM funders WHERE source_table = 'yf_sponsors';

  RAISE NOTICE '=== POST-MIGRATION VALIDATION ===';
  RAISE NOTICE 'yf_trusts: % → organizations(TRUST): % [%]', v_trusts_src, v_trusts_dst, CASE WHEN v_trusts_src = v_trusts_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_schools: % → organizations(SCHOOL): % [%]', v_schools_src, v_schools_dst, CASE WHEN v_schools_src = v_schools_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_sponsors: % → organizations(SPONSOR): % [%]', v_sponsors_src, v_sponsors_dst, CASE WHEN v_sponsors_src = v_sponsors_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_sponsors: % → funders: % [%]', v_sponsors_src, v_funders_dst, CASE WHEN v_sponsors_src = v_funders_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_contacts: % → contacts: % [%]', v_contacts_src, v_contacts_dst, CASE WHEN v_contacts_src = v_contacts_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_funding_opportunities: % → funding_opportunities: % [%]', v_funding_src, v_funding_dst, CASE WHEN v_funding_src = v_funding_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_programmes: % → programmes: % [%]', v_programmes_src, v_programmes_dst, CASE WHEN v_programmes_src = v_programmes_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_students: % → students: % [%]', v_students_src, v_students_dst, CASE WHEN v_students_src = v_students_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_volunteers: % → volunteers: % [%]', v_volunteers_src, v_volunteers_dst, CASE WHEN v_volunteers_src = v_volunteers_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_placements: % → placements: % [%]', v_placements_src, v_placements_dst, CASE WHEN v_placements_src = v_placements_dst THEN 'OK' ELSE 'MISMATCH' END;
  RAISE NOTICE 'yf_activities: % → activities: % [%]', v_activities_src, v_activities_dst, CASE WHEN v_activities_src = v_activities_dst THEN 'OK' ELSE 'MISMATCH' END;
END $$;
