CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app."Confirmation_confirmation_test_records" (
  id SERIAL PRIMARY KEY,
  operator_name TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  reading_value NUMERIC,
  product TEXT DEFAULT '',
  batch_number TEXT DEFAULT '',
  shift_name TEXT NOT NULL DEFAULT 'Unknown Shift',
  remarks TEXT DEFAULT '',

  -- Main timestamp for the actual confirmation/test record.
  -- This is the timestamp you can show in reports or dashboards.
  record_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit timestamps.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app."Confirmation_confirmation_test_records"
  ADD COLUMN IF NOT EXISTS product TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_name TEXT NOT NULL DEFAULT 'Unknown Shift',
  ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS reading_value NUMERIC,
  ADD COLUMN IF NOT EXISTS record_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_Confirmation_confirmation_test_records_created_at
ON app."Confirmation_confirmation_test_records"(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_Confirmation_confirmation_test_records_record_timestamp
ON app."Confirmation_confirmation_test_records"(record_timestamp DESC);

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_Confirmation_confirmation_test_records_updated_at
ON app."Confirmation_confirmation_test_records";

CREATE TRIGGER trg_Confirmation_confirmation_test_records_updated_at
BEFORE UPDATE ON app."Confirmation_confirmation_test_records"
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();


CREATE TABLE IF NOT EXISTS app."Confirmation_face_identities" (
  id SERIAL PRIMARY KEY,
  operator_name TEXT NOT NULL,
  employee_id TEXT DEFAULT '',
  department TEXT DEFAULT '',
  role_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  face_provider TEXT NOT NULL DEFAULT 'face-ai',

  -- Main key returned by the Face AI result. This can be img_name,
  -- embedding_hash, face_hash, sequence, _id, or another stable AI identifier.
  ai_face_key TEXT NOT NULL UNIQUE,

  -- Extra identifiers from the Face AI payload so login can still match even
  -- if the AI returns img_name on one call and embedding_hash on another.
  ai_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,

  ai_register_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_last_match_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app."Confirmation_face_identities"
  ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employee_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS role_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS face_provider TEXT NOT NULL DEFAULT 'face-ai',
  ADD COLUMN IF NOT EXISTS ai_face_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_register_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_last_match_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_Confirmation_face_identities_ai_face_key
ON app."Confirmation_face_identities"(ai_face_key)
WHERE ai_face_key IS NOT NULL AND ai_face_key <> '';

CREATE INDEX IF NOT EXISTS idx_Confirmation_face_identities_ai_identifiers
ON app."Confirmation_face_identities" USING GIN(ai_identifiers);

CREATE INDEX IF NOT EXISTS idx_Confirmation_face_identities_operator_name
ON app."Confirmation_face_identities"(operator_name);

DROP TRIGGER IF EXISTS trg_Confirmation_face_identities_updated_at
ON app."Confirmation_face_identities";

CREATE TRIGGER trg_Confirmation_face_identities_updated_at
BEFORE UPDATE ON app."Confirmation_face_identities"
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();
