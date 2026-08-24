-- PIN authentication extension for the Confirmation application.
-- Run after schema.sql so app.face_identities already exists.

ALTER TABLE app.face_identities
  ADD COLUMN IF NOT EXISTS auth_method TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

UPDATE app.face_identities
SET auth_method = CASE
  WHEN pin_hash IS NOT NULL AND pin_hash <> '' THEN 'pin'
  ELSE 'face'
END
WHERE auth_method IS NULL
   OR auth_method NOT IN ('face', 'pin');

ALTER TABLE app.face_identities
  ALTER COLUMN auth_method SET DEFAULT 'pin',
  ALTER COLUMN auth_method SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'face_identities_auth_method_check'
      AND conrelid = 'app.face_identities'::regclass
  ) THEN
    ALTER TABLE app.face_identities
      ADD CONSTRAINT face_identities_auth_method_check
      CHECK (auth_method IN ('face', 'pin'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_face_identities_unique_pin_hash
ON app.face_identities(pin_hash)
WHERE pin_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_face_identities_auth_method
ON app.face_identities(auth_method, active);
