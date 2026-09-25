-- programme_cohorts, programme_sessions, and session_attendance were defined in the
-- Drizzle schema but never had a corresponding SQL migration file.
-- This migration creates them with IF NOT EXISTS guards so it is safe to re-run.

DO $$ BEGIN
  CREATE TYPE cohort_status AS ENUM ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_format AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS programme_cohorts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  programme_id TEXT NOT NULL REFERENCES programmes(id),
  cohort_name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  capacity INTEGER,
  enrolled_count INTEGER DEFAULT 0,
  status cohort_status DEFAULT 'PLANNED',
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- LMS extensions added by 0013
  programme_type TEXT,
  programme_manager_id TEXT REFERENCES users(id),
  lead_teacher_name TEXT,
  min_attendance_sessions INTEGER DEFAULT 6,
  lms_lifecycle_status TEXT
);

CREATE TABLE IF NOT EXISTS programme_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  programme_id TEXT NOT NULL REFERENCES programmes(id),
  cohort_id TEXT REFERENCES programme_cohorts(id),
  session_number INTEGER,
  session_date TEXT,
  start_time TEXT,
  end_time TEXT,
  venue TEXT,
  delivery_format delivery_format,
  facilitator_id TEXT,
  volunteer_ids TEXT[],
  topic TEXT,
  description TEXT,
  session_status session_status DEFAULT 'SCHEDULED',
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- LMS extension added by 0013
  session_type TEXT
);

CREATE TABLE IF NOT EXISTS session_attendance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  session_id TEXT NOT NULL REFERENCES programme_sessions(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  attended BOOLEAN DEFAULT false,
  attendance_status attendance_status DEFAULT 'ABSENT',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programme_cohorts_tenant ON programme_cohorts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_programme_cohorts_programme ON programme_cohorts(programme_id);
CREATE INDEX IF NOT EXISTS idx_programme_sessions_tenant ON programme_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_programme_sessions_cohort ON programme_sessions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_student ON session_attendance(student_id);
