import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

function envBool(value) {
  return String(value || "").toLowerCase() === "true";
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: envBool(process.env.DB_SSL) ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

export async function testDbConnection() {
  const result = await pool.query("SELECT NOW() AS db_time");
  return result.rows[0];
}
