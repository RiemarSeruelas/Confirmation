CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS app.face_identities (
  id SERIAL PRIMARY KEY,
  operator_name TEXT NOT NULL,
  employee_id TEXT DEFAULT '',
  site_name TEXT NOT NULL DEFAULT 'Savoury',
  shift_name TEXT NOT NULL DEFAULT '1st Shift',
  department TEXT DEFAULT '',
  role_name TEXT NOT NULL DEFAULT 'operator',
  email TEXT DEFAULT '',
  face_provider TEXT NOT NULL DEFAULT 'face-ai',
  ai_face_key TEXT UNIQUE,
  ai_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_register_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_last_match_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  registered_by TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_face_identities_site_name CHECK (site_name IN ('Savoury', 'Dressings', 'Admin')),
  CONSTRAINT chk_face_identities_shift_name CHECK (shift_name IN ('1st Shift', '2nd Shift', '3rd Shift')),
  CONSTRAINT chk_face_identities_role_name CHECK (role_name IN ('operator', 'admin'))
);

ALTER TABLE app.face_identities
  ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employee_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS site_name TEXT NOT NULL DEFAULT 'Savoury',
  ADD COLUMN IF NOT EXISTS shift_name TEXT NOT NULL DEFAULT '1st Shift',
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS role_name TEXT NOT NULL DEFAULT 'operator',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS face_provider TEXT NOT NULL DEFAULT 'face-ai',
  ADD COLUMN IF NOT EXISTS ai_face_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_register_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_last_match_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS registered_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE app.face_identities
SET role_name = 'operator'
WHERE role_name IS NULL OR role_name = '';

UPDATE app.face_identities
SET site_name = 'Savoury'
WHERE site_name IS NULL OR site_name = '';

UPDATE app.face_identities
SET shift_name = '1st Shift'
WHERE shift_name IS NULL OR shift_name = '' OR shift_name NOT IN ('1st Shift', '2nd Shift', '3rd Shift');

CREATE UNIQUE INDEX IF NOT EXISTS idx_face_identities_ai_face_key
ON app.face_identities(ai_face_key)
WHERE ai_face_key IS NOT NULL AND ai_face_key <> '';

CREATE INDEX IF NOT EXISTS idx_face_identities_ai_identifiers
ON app.face_identities USING GIN(ai_identifiers);

CREATE INDEX IF NOT EXISTS idx_face_identities_operator_name
ON app.face_identities(operator_name);

CREATE INDEX IF NOT EXISTS idx_face_identities_role_name
ON app.face_identities(role_name);

CREATE INDEX IF NOT EXISTS idx_face_identities_shift_name
ON app.face_identities(shift_name);

DROP TRIGGER IF EXISTS trg_face_identities_updated_at
ON app.face_identities;

CREATE TRIGGER trg_face_identities_updated_at
BEFORE UPDATE ON app.face_identities
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.confirmation_test_records (
  id SERIAL PRIMARY KEY,
  operator_id INTEGER REFERENCES app.face_identities(id) ON DELETE SET NULL,
  operator_name TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT 'Savoury',
  machine_name TEXT NOT NULL,
  reading_value NUMERIC,
  product TEXT DEFAULT '',
  batch_number TEXT DEFAULT '',
  shift_name TEXT NOT NULL DEFAULT '1st Shift',
  shift_work_date DATE,
  remarks TEXT DEFAULT '',
  record_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_confirmation_records_site_name CHECK (site_name IN ('Savoury', 'Dressings', 'Admin')),
  CONSTRAINT chk_confirmation_records_shift_name CHECK (shift_name IN ('1st Shift', '2nd Shift', '3rd Shift'))
);

ALTER TABLE app.confirmation_test_records
  ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES app.face_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_name TEXT NOT NULL DEFAULT 'Savoury',
  ADD COLUMN IF NOT EXISTS product TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_name TEXT NOT NULL DEFAULT '1st Shift',
  ADD COLUMN IF NOT EXISTS shift_work_date DATE,
  ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS reading_value NUMERIC,
  ADD COLUMN IF NOT EXISTS record_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE app.confirmation_test_records
SET shift_name = '1st Shift'
WHERE shift_name IS NULL OR shift_name = '' OR shift_name = 'Unknown Shift';

UPDATE app.confirmation_test_records
SET site_name = 'Savoury'
WHERE site_name IS NULL OR site_name = '';

UPDATE app.confirmation_test_records
SET shift_work_date = (record_timestamp AT TIME ZONE 'Asia/Manila')::date
WHERE shift_work_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_created_at
ON app.confirmation_test_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_record_timestamp
ON app.confirmation_test_records(record_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_operator_shift
ON app.confirmation_test_records(operator_id, shift_name, shift_work_date DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_operator_machine_shift
ON app.confirmation_test_records(operator_id, lower(machine_name), shift_name, shift_work_date DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_shift_work_date
ON app.confirmation_test_records(shift_work_date DESC);

DROP TRIGGER IF EXISTS trg_confirmation_test_records_updated_at
ON app.confirmation_test_records;

CREATE TRIGGER trg_confirmation_test_records_updated_at
BEFORE UPDATE ON app.confirmation_test_records
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();
