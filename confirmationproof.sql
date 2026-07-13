CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.confirmationproof (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES app.confirmation_test_records(id) ON DELETE CASCADE,
  machine_config_id INTEGER REFERENCES app.machine_configs(id) ON DELETE SET NULL,
  field_id TEXT NOT NULL,
  field_label TEXT NOT NULL DEFAULT '',
  recognized_value TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  image_data BYTEA NOT NULL,
  image_size_bytes INTEGER NOT NULL,
  image_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.confirmationproof
  ADD COLUMN IF NOT EXISTS record_id INTEGER REFERENCES app.confirmation_test_records(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS machine_config_id INTEGER REFERENCES app.machine_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS field_id TEXT,
  ADD COLUMN IF NOT EXISTS field_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recognized_value TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS image_data BYTEA,
  ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS image_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmationproof_record_field
ON app.confirmationproof(record_id, field_id);

CREATE INDEX IF NOT EXISTS idx_confirmationproof_record
ON app.confirmationproof(record_id);

CREATE INDEX IF NOT EXISTS idx_confirmationproof_machine
ON app.confirmationproof(machine_config_id);

CREATE INDEX IF NOT EXISTS idx_confirmationproof_created_at
ON app.confirmationproof(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_confirmationproof_sha256
ON app.confirmationproof(image_sha256);
