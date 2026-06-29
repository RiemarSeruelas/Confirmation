CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.confirmation_test_records (
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

ALTER TABLE app.confirmation_test_records
  ADD COLUMN IF NOT EXISTS product TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_name TEXT NOT NULL DEFAULT 'Unknown Shift',
  ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS reading_value NUMERIC,
  ADD COLUMN IF NOT EXISTS record_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_created_at
ON app.confirmation_test_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_record_timestamp
ON app.confirmation_test_records(record_timestamp DESC);

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_confirmation_test_records_updated_at
ON app.confirmation_test_records;

CREATE TRIGGER trg_confirmation_test_records_updated_at
BEFORE UPDATE ON app.confirmation_test_records
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();
