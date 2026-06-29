import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const useSsl = String(process.env.PGSSL || "false").toLowerCase() === "true";

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || "Confirmation_confirmation_app",
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
      }
);

export async function testDbConnection() {
  const result = await pool.query("SELECT NOW() AS server_time");
  return result.rows[0];
}
