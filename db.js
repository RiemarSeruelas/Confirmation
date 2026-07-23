import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const ssl = String(process.env.PGSSL || "false").toLowerCase() === "true"
  ? { rejectUnauthorized: false }
  : false;

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "confirmation_test_db",
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl,
    };

export const pool = new Pool(config);

export async function testDbConnection() {
  const { rows } = await pool.query(
    "SELECT current_database() AS current_database, NOW() AS server_time"
  );
  return rows[0];
}
