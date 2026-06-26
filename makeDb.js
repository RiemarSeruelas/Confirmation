import { pool } from "./db.js";

export async function makeDatabase() {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS app;

    CREATE TABLE IF NOT EXISTS app.confirmation_test_records (
      id SERIAL PRIMARY KEY,
      operator_name TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      reading_value NUMERIC,
      product TEXT DEFAULT '',
      batch_number TEXT DEFAULT '',
      shift_name TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE app.confirmation_test_records
      ADD COLUMN IF NOT EXISTS product TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS shift_name TEXT DEFAULT 'Unknown Shift',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_confirmation_test_records_created_at
    ON app.confirmation_test_records(created_at DESC);
  `);

  console.log("DB maker done: app schema and confirmation_test_records table are ready.");
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  makeDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("DB maker failed:", error);
      await pool.end();
      process.exit(1);
    });
}
