-- Run this inside the existing PostgreSQL database used by the application.
-- The database name must match PGDATABASE in the project's .env file.

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app."Confirmation-logs" (
  id BIGSERIAL PRIMARY KEY,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL DEFAULT 'session',
  session_id TEXT NOT NULL UNIQUE,
  operator_id INTEGER REFERENCES app.face_identities(id) ON DELETE SET NULL,
  operator_name TEXT NOT NULL DEFAULT 'Anonymous',
  role_name TEXT NOT NULL DEFAULT 'visitor',
  site_name TEXT NOT NULL DEFAULT 'Unknown',
  entry_page TEXT NOT NULL DEFAULT 'auth',
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  device_type TEXT NOT NULL DEFAULT 'desktop',
  user_agent TEXT NOT NULL DEFAULT 'unknown'
);

ALTER TABLE app."Confirmation-logs"
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES app.face_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT 'Anonymous',
  ADD COLUMN IF NOT EXISTS role_name TEXT NOT NULL DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS site_name TEXT NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS entry_page TEXT NOT NULL DEFAULT 'auth',
  ADD COLUMN IF NOT EXISTS ip_address TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'desktop',
  ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT 'unknown';

UPDATE app."Confirmation-logs"
SET
  session_id = 'legacy-' || id
WHERE BTRIM(session_id) = '';

UPDATE app."Confirmation-logs"
SET
  event_type = 'session',
  last_seen_at = COALESCE(last_seen_at, logged_at);

WITH session_times AS (
  SELECT
    session_id,
    MIN(logged_at) AS session_started_at,
    MAX(last_seen_at) AS session_last_seen_at
  FROM app."Confirmation-logs"
  GROUP BY session_id
)
UPDATE app."Confirmation-logs" AS target
SET
  logged_at = session_times.session_started_at,
  last_seen_at = session_times.session_last_seen_at
FROM session_times
WHERE target.session_id = session_times.session_id;

WITH ranked_sessions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id
      ORDER BY
        (operator_name <> 'Anonymous') DESC,
        (operator_id IS NOT NULL) DESC,
        last_seen_at DESC,
        id DESC
    ) AS duplicate_number
  FROM app."Confirmation-logs"
)
DELETE FROM app."Confirmation-logs" AS target
USING ranked_sessions
WHERE target.id = ranked_sessions.id
  AND ranked_sessions.duplicate_number > 1;

ALTER TABLE app."Confirmation-logs"
  ALTER COLUMN last_seen_at SET DEFAULT NOW(),
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN event_type SET DEFAULT 'session';

CREATE INDEX IF NOT EXISTS idx_confirmation_logs_logged_at
ON app."Confirmation-logs"(logged_at DESC);

DROP INDEX IF EXISTS app.idx_confirmation_logs_session_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmation_logs_session_id
ON app."Confirmation-logs"(session_id);

CREATE INDEX IF NOT EXISTS idx_confirmation_logs_operator
ON app."Confirmation-logs"(operator_name, logged_at DESC);
